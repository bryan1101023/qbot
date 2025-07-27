import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageActionRowComponentBuilder } from 'discord.js';
import { config } from '../../config';
import { provider } from '../../database';
import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addDays } from 'date-fns';
import { writeFileSync, readFileSync, existsSync } from 'fs';
const SESSION_EMBED_PATH = './src/resources/session_embed.json';

const TIMES = ['10AM', '1PM', '4PM', '7PM', '10PM'];
const TIME_ZONE = 'Europe/Athens';

interface SessionTimeSlot {
    time: string;
    date: Date;
    claims: Array<{
        role: string;
        claimedBy: string;
    }>;
}

class SessionsCommand extends Command {
    constructor() {
        super({
            trigger: 'sessions',
            description: 'View and manage training sessions for the week.',
            type: 'ChatInput',
            module: 'information',
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.all,
                    value: true,
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        try {
            // Get current time in Athens timezone
            const nowAthens = toZonedTime(new Date(), TIME_ZONE);
            const today = new Date(nowAthens.getFullYear(), nowAthens.getMonth(), nowAthens.getDate());
            
            // Get the day of week (0 = Sunday, 1 = Monday, etc.)
            const dayOfWeek = today.getDay();
            
            // Calculate days from today to Friday (5)
            const daysToFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek);
            
            // Create array of dates from today through Friday
            const weekDates = [];
            for (let i = 0; i <= daysToFriday; i++) {
                weekDates.push(addDays(today, i));
            }

            const allEmbeds = [];
            const allComponents = [];

            for (const baseDate of weekDates) {
                const startOfDay = new Date(baseDate);
                const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

                // Get all sessions for this day
                let sessions = await provider.session.findMany({
                    where: {
                        date: {
                            gte: startOfDay,
                            lt: endOfDay
                        }
                    }
                });

                // --- CLEANUP: Remove duplicate 'available' sessions if a 'claimed' one exists for the same slot ---
                const slotsWithClaimed = new Set(sessions.filter(s => s.status === 'claimed').map(s => `${s.time}|${s.date.toISOString()}`));
                const duplicateAvailableIds = sessions
                    .filter(s => s.status === 'available' && slotsWithClaimed.has(`${s.time}|${s.date.toISOString()}`))
                    .map(s => s.id);
                if (duplicateAvailableIds.length > 0) {
                    await provider.session.deleteMany({
                        where: { id: { in: duplicateAvailableIds } }
                    });
                    // Remove from local data
                    sessions = sessions.filter(s => !duplicateAvailableIds.includes(s.id));
                }

                // --- Only create a session if none exists for that slot (regardless of status) ---
                const existingSlots = new Set(sessions.map(s => `${s.time}|${s.date.toISOString()}`));
                const sessionsToCreate = TIMES.map(time => {
                    const [hour, meridiem] = time.match(/(\d+)(AM|PM)/).slice(1);
                    let hours = parseInt(hour);
                    if (meridiem === 'PM' && hours !== 12) hours += 12;
                    if (meridiem === 'AM' && hours === 12) hours = 0;
                    const year = baseDate.getFullYear();
                    const month = baseDate.getMonth();
                    const date = baseDate.getDate();
                    const athensDate = new Date(year, month, date, hours, 0, 0);
                    const sessionTimeUTC = fromZonedTime(athensDate, TIME_ZONE);
                    return {
                        time: `${time} EET`,
                        date: sessionTimeUTC,
                        status: 'available'
                    };
                }).filter(session => {
                    // Only create if no session exists for this slot
                    return !Array.from(existingSlots).some(slot => slot.startsWith(`${session.time}|`));
                });
                
                if (sessionsToCreate.length > 0) {
                    const createdSessions = await Promise.all(
                        sessionsToCreate.map(session => 
                            provider.session.create({
                                data: session
                            })
                        )
                    );
                    sessions = [...sessions, ...createdSessions];
                }

                // --- Group sessions by time, prefer 'claimed' over 'available' for display ---
                const sessionsByTime: Record<string, SessionTimeSlot> = {};
                TIMES.forEach(time => {
                    const label = `${time} EET`;
                    // Find all sessions for this time
                    const slotSessions = sessions.filter(s => s.time === label);
                    // Prefer claimed, else available
                    let session = slotSessions.find(s => s.status === 'claimed') || slotSessions.find(s => s.status === 'available');
                    if (session) {
                        sessionsByTime[label] = {
                            time: session.time,
                            date: session.date,
                            claims: []
                        };
                        // Add claims if any
                        slotSessions.filter(s => s.status === 'claimed' && s.claimedBy && s.role).forEach(claimed => {
                            sessionsByTime[label].claims.push({
                                role: claimed.role,
                                claimedBy: claimed.claimedBy
                            });
                        });
                    }
                });

                // Create embed for this day
                const embed = new EmbedBuilder()
                    .setTitle(`${format(baseDate, 'EEEE do MMMM')} (EET)`)
                    .setColor('#57F287');

                // Sort time slots chronologically
                const sortedTimeSlots = Object.values(sessionsByTime)
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                // Add fields for each time slot
                sortedTimeSlots.forEach(timeSlot => {
                    const statusEmoji = timeSlot.claims.length > 0 ? '🟢' : '🔴';
                    
                    // Sort claims by role order (Host first, then Trainer, then Assistant)
                    const roleOrder = { 'Host': 0, 'Trainer': 1, 'Assistant': 2 };
                    const sortedClaims = timeSlot.claims.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
                    
                    let claimsText;
                    if (sortedClaims.length === 0) {
                        claimsText = '> - No claims yet';
                    } else {
                        claimsText = sortedClaims.map(claim => 
                            `> - <@${claim.claimedBy}> (${claim.role})`
                        ).join('\n');
                    }

                    // Get the Unix timestamp for Discord's timestamp formatting
                    const timestamp = Math.floor(new Date(timeSlot.date).getTime() / 1000);

                    embed.addFields({
                        name: `${statusEmoji} ${timeSlot.time}`,
                        value: `> - Starting <t:${timestamp}:R>\n${claimsText}`,
                        inline: false
                    });
                });

                // If no sessions were added, add a note
                if (sortedTimeSlots.length === 0) {
                    embed.setDescription('No sessions scheduled for this day.');
                }

                allEmbeds.push(embed);
            }

            // Create a single Claim/Unclaim Session button below all embeds
            const claimButton = new ButtonBuilder()
                .setCustomId('session-claim')
                .setLabel('Claim/Unclaim Session')
                .setStyle(ButtonStyle.Secondary);
            const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>()
                .addComponents(claimButton);

            // Send all embeds in one message
            const sentMsg = await ctx.subject.channel.send({ 
                embeds: allEmbeds, 
                components: [actionRow as any]
            });
            
            // Store the message ID for reliable updates
            writeFileSync(SESSION_EMBED_PATH, JSON.stringify({ messageId: sentMsg.id, channelId: sentMsg.channel.id }), 'utf-8');

            // Send an ephemeral confirmation
            await ctx.reply({
                content: `Sessions for ${weekDates.length} day${weekDates.length > 1 ? 's' : ''} have been displayed below.`,
                ephemeral: true
            });
        } catch (err) {
            console.error('Error in sessions command:', err);
            return ctx.reply({
                content: 'There was an error while fetching the sessions. Please try again.',
                ephemeral: true
            });
        }
    }
}

export default SessionsCommand; 