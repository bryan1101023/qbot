import { discordClient } from '../main';
import { CommandContext } from '../structures/addons/CommandAddons';
import {
    Interaction,
    CommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    ChannelType,
    CacheType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageActionRowComponentBuilder,
    InteractionReplyOptions,
    ComponentType
} from 'discord.js';
import { handleRobloxUser } from '../arguments/handleRobloxUser';
import { handleRobloxRole } from '../arguments/handleRobloxRole';
import { getUnknownCommandMessage, getNoPermissionEmbed, greenColor, redColor } from '../handlers/locale';
import { updateRequestStatus, getRequestByMessageId } from '../database/inactivity';
import { provider } from '../database';
import { toZonedTime, format } from 'date-fns-tz';
import { addDays } from 'date-fns';
import type { SessionTimeSlot } from '../structures/types';
import { readFileSync, existsSync } from 'fs';
const SESSION_EMBED_PATH = './src/resources/session_embed.json';

const TIME_ZONE = 'Europe/Athens';

const handleInteraction = async (payload: Interaction<CacheType>) => {
    if(payload instanceof CommandInteraction) {
        const interaction = payload as CommandInteraction;
        if(!interaction.channel || !interaction.guild) return interaction.reply({ embeds: [ getUnknownCommandMessage() ] });
        const command = discordClient.commands.find((cmd) => (new cmd()).trigger === interaction.commandName);
        const context = new CommandContext(interaction, command);
        const permission = context.checkPermissions();
        if(!permission) {
            context.reply({ embeds: [ getNoPermissionEmbed() ] });
        } else {
            // Only defer if the command has shouldDefer true
            if ((new command()).shouldDefer) {
                await context.defer();
            }
            try {
                await (new command()).run(context);
            } catch (err) {
                console.log(err);
            }
        }
    } else if(payload instanceof AutocompleteInteraction) {
        const interaction = payload as AutocompleteInteraction;
        if(!interaction.channel || !interaction.guild) return;
        const focusedOption = payload.options.getFocused(true);
        const command = await discordClient.commands.find((cmd) => (new cmd()).trigger === interaction.commandName);
        if(!command) return;
        const focusedArg = (new command()).args.find((arg) => arg.trigger === focusedOption.name);
        if(focusedArg.type === 'RobloxUser') handleRobloxUser(interaction, focusedOption);
        if(focusedArg.type === 'RobloxRole') await handleRobloxRole(interaction, focusedOption);
    } else if(payload instanceof ButtonInteraction) {
        const interaction = payload as ButtonInteraction;
        if(!interaction.channel || !interaction.guild) return;
        
        if(interaction.customId.startsWith('inactivity-')) {
            if (interaction.customId.startsWith('inactivity-cancel-')) {
                await handleInactivityCancel(interaction);
            } else {
                await handleInactivityButton(interaction);
            }
        } else if(interaction.customId === 'session-claim') {
            await handleSessionClaim(interaction);
        } else if(interaction.customId.startsWith('session-time-')) {
            await handleSessionTimeSelect(interaction);
        } else if(interaction.customId.startsWith('session-role-')) {
            await handleSessionRoleSelect(interaction);
        }
    }
}

const handleInactivityButton = async (interaction: ButtonInteraction) => {
    const isApproved = interaction.customId === 'inactivity-approve';
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    
    // Update embed color and status
    embed.setColor(isApproved ? greenColor : redColor);
    const statusField = embed.data.fields?.find(field => field.name === 'Status');
    if (statusField) {
        statusField.value = isApproved ? 'This request has been approved.' : 'This request has been declined.';
    }
    
    // Update buttons (disable both, show who approved/denied)
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('inactivity-approve')
            .setLabel(isApproved ? `Approved by ${interaction.user.username}` : 'Approve')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('inactivity-deny')
            .setLabel(!isApproved ? `Denied by ${interaction.user.username}` : 'Deny')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
    );
    
    // Update the original message in the review channel
    await interaction.update({
        embeds: [embed],
        components: [actionRow.toJSON() as any],
    });

    // Persist status in database
    updateRequestStatus(interaction.message.id, isApproved ? 'approved' : 'denied', interaction.user.id);
    
    // Ephemeral confirmation to moderator
    await interaction.followUp({
        content: `You have ${isApproved ? 'approved' : 'denied'} this inactivity request. The user will be notified in DMs.`,
        ephemeral: true,
    });
    
    // Send DM to user
    const userId = embed.data.fields?.find(field => field.name === 'User')?.value?.match(/\((\d+)\)/)?.[1];
    if (userId) {
        try {
            const user = await interaction.client.users.fetch(userId);
            
            if (isApproved) {
                // Always send approval status notification
                const dmEmbed = new EmbedBuilder()
                    .setTitle('Inactivity Request Update')
                    .setColor(greenColor)
                    .setDescription(`Your inactivity request has been **approved** by ${interaction.user.username}.`);
                
                await user.send({ embeds: [dmEmbed] });
                
                // Check if inactivity starts today and send begins notification if so
                const approvedRequest = getRequestByMessageId(interaction.message.id);
                if (approvedRequest) {
                    const startDate = new Date(approvedRequest.startDate);
                    const today = new Date();
                    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
                    
                    // Check if inactivity starts today
                    const startsToday = startDate >= startOfDay && startDate < endOfDay;
                    
                    if (startsToday) {
                        // Send the inactivity begins notification
                        const moderator = await interaction.client.users.fetch(interaction.user.id);
                        const inactivityEmbed = new EmbedBuilder()
                            .setTitle('Inactivity Notice Begins! 🎉')
                            .setColor('#57F287')
                            .setDescription(`Hey there, **${user.username}**!\n\nI'm Kusai's Assistant, I'm sure you've heard of me! Well, I'm here to notify you that your inactivity notice has officially begun! 🎉 Now, make sure to read the information below, violating any of the rules below will result in cancellation of your current inactivity notice.\n\n**Information**\n\n• **1.** Your inactivity reason was **"${approvedRequest.reason}"** and it got approved by **${moderator.username}**.\n\n• **2.** Following up, if you are found being active in other groups or lying about your inactivity notice, it will be cancelled and consequences will occur! You are not allowed to be active in other groups while you are on IN at Kusai Kitchen.\n\n• **3.** Finally, you are not allowed to conduct any alliance visits, claim any training roles including but not limited to Host, Trainer, Assistant, Spectator, etc.\n\nWe will wait for your return! Farewell!`)
                            .setTimestamp();
                        
                        await user.send({ embeds: [inactivityEmbed] });
                        console.log(`Sent immediate inactivity notification to ${user.username} (${user.id})`);
                    }
                }
            } else {
                // Send denial notification
                const dmEmbed = new EmbedBuilder()
                    .setTitle('Inactivity Request Update')
                    .setColor(redColor)
                    .setDescription(`Your inactivity request has been **denied** by ${interaction.user.username}.`);
                
                await user.send({ embeds: [dmEmbed] });
            }
        } catch (err) {
            console.error('Failed to send DM to user:', err);
        }
    }
}

const handleInactivityCancel = async (interaction: ButtonInteraction) => {
    const messageId = interaction.customId.replace('inactivity-cancel-', '');
    const req = getRequestByMessageId(messageId);
    if (!req) {
        await interaction.reply({ content: 'Could not find the inactivity request to cancel.', ephemeral: true });
        return;
    }
    // Update status in DB
    updateRequestStatus(messageId, 'denied', interaction.user.id); // treat as denied for DB
    // Update review channel embed
    try {
        const reviewMsg = await interaction.channel.messages.fetch(messageId);
        if (reviewMsg) {
            const embed = EmbedBuilder.from(reviewMsg.embeds[0]);
            embed.setColor(redColor);
            const statusField = embed.data.fields?.find(field => field.name === 'Status');
            if (statusField) statusField.value = 'This request has been cancelled.';
            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('inactivity-approve')
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('inactivity-deny')
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true),
            );
            await reviewMsg.edit({ embeds: [embed], components: [actionRow.toJSON() as any] });
        }
    } catch {}
    // DM user
    try {
        const user = await interaction.client.users.fetch(req.userId);
        const dmEmbed = new EmbedBuilder()
            .setTitle('Inactivity Notice Cancelled')
            .setColor(redColor)
            .setDescription('Your inactivity notice has been cancelled by you.');
        await user.send({ embeds: [dmEmbed] });
    } catch {}
    // Ephemeral confirmation
    await interaction.reply({ content: 'Your inactivity request has been cancelled.', ephemeral: true });
}

const handleSessionClaim = async (interaction: ButtonInteraction) => {
    const nowAthens = toZonedTime(new Date(), TIME_ZONE);
    let baseDate = new Date(nowAthens.getFullYear(), nowAthens.getMonth(), nowAthens.getDate());
    let startOfDay = new Date(baseDate);
    let endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    
    // Get all sessions for today
    let sessions = await provider.session.findMany({
        where: {
            date: {
                gte: startOfDay,
                lt: endOfDay
            }
        }
    });

    // If all sessions have started and ended, check the next day's sessions
    const allSessionsEnded = sessions.length > 0 && sessions.every(s => toZonedTime(s.date, TIME_ZONE).getTime() < nowAthens.getTime());
    if (sessions.length === 0 || allSessionsEnded) {
        baseDate = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
        startOfDay = new Date(baseDate);
        endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        sessions = await provider.session.findMany({
            where: {
                date: {
                    gte: startOfDay,
                    lt: endOfDay
                }
            }
        });
    }

    // Group sessions by time
    const sessionsByTime = sessions.reduce<Record<string, SessionTimeSlot>>((acc, session) => {
        if (!acc[session.time]) {
            acc[session.time] = {
                id: session.id,
                time: session.time,
                date: session.date,
                claims: []
            };
        }
        if (session.status === 'claimed' && session.claimedBy && session.role) {
            acc[session.time].claims.push({
                role: session.role,
                claimedBy: session.claimedBy
            });
        }
        return acc;
    }, {});

    // Sort times chronologically and filter out sessions that have already started
    const sortedTimeSlots = Object.values(sessionsByTime)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .filter(timeSlot => {
            const sessionTimeAthens = toZonedTime(timeSlot.date, TIME_ZONE);
            return sessionTimeAthens.getTime() > nowAthens.getTime();
        });

    // If no future sessions available
    if (sortedTimeSlots.length === 0) {
        await interaction.reply({
            content: 'No upcoming sessions are available to claim.',
            ephemeral: true
        });
        return;
    }

    // Create ephemeral row of time slot buttons
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    sortedTimeSlots.forEach(timeSlot => {
        const allRolesClaimed = timeSlot.claims.length >= 3;
        const userHasClaim = timeSlot.claims.some(claim => claim.claimedBy === interaction.user.id);
        
        // Show button if:
        // 1. Not all roles are claimed (has open slots), OR
        // 2. User has already claimed a role in this session (so they can unclaim)
        if (!allRolesClaimed || userHasClaim) {
            const button = new ButtonBuilder()
                .setCustomId(`session-time-${timeSlot.id}`)
                .setLabel(timeSlot.time)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(false); // Never disable if user has claim or if there are open slots
            row.addComponents(button);
        }
    });

    await interaction.reply({
        content: 'Select a time to claim below:',
        components: [row as any],
        ephemeral: true
    });
};

const handleSessionTimeSelect = async (interaction: ButtonInteraction) => {
    let didError = false;
    try {
        const sessionId = interaction.customId.replace('session-time-', '');

        // Find session by ID
        const session = await provider.session.findUnique({
            where: { id: sessionId }
        });

        if (!session) {
            await interaction.reply({
                content: 'This session no longer exists.',
                ephemeral: true
            });
            didError = true;
            return;
        }

        // Check if session has started using Athens time
        const nowAthens = toZonedTime(new Date(), TIME_ZONE);
        const sessionTimeAthens = toZonedTime(session.date, TIME_ZONE);

        if (nowAthens.getTime() > sessionTimeAthens.getTime()) {
            await interaction.reply({
                content: 'This session has already started.',
                ephemeral: true
            });
            didError = true;
            return;
        }

        // Get all claims for this session time
        const existingClaims = await provider.session.findMany({
            where: {
                time: session.time,
                date: session.date,
                status: 'claimed'
            }
        });

        // If user has claimed any role for this session time, unclaim on click
        const userClaim = existingClaims.find(claim => claim.claimedBy === interaction.user.id);
        if (userClaim) {
            // Unclaim the session (just remove this user's claim, don't delete the session)
            await provider.session.update({
                where: { id: userClaim.id },
                data: {
                    status: 'available',
                    claimedBy: null,
                    role: null
                }
            });

            await interaction.reply({
                content: 'You have unclaimed this session.',
                components: [],
                ephemeral: true
            });
            // Optionally: refresh the sessions embed here
            return;
        }

        // Show only available roles (not already claimed)
        const allRoles = ['Host', 'Trainer', 'Assistant'];
        const claimedRoles = existingClaims.map(claim => claim.role);
        const availableRoles = allRoles.filter(role => !claimedRoles.includes(role));
        if (availableRoles.length === 0) {
            await interaction.reply({
                content: 'All roles for this session have been claimed.',
                ephemeral: true
            });
            didError = true;
            return;
        }
        const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
        availableRoles.forEach(role => {
            const button = new ButtonBuilder()
                .setCustomId(`session-role-${session.id}-${role}`)
                .setLabel(role)
                .setStyle(ButtonStyle.Primary);
            row.addComponents(button);
        });

        await interaction.reply({
            content: 'Select your role for this session:',
            components: [row as any],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error in handleSessionTimeSelect:', error);
        if (!didError) {
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        }
    } finally {
        await refreshSessionsEmbed(interaction);
    }
};

const handleSessionRoleSelect = async (interaction: ButtonInteraction) => {
    let didError = false;
    try {
        // Log the full customId for debugging
        console.log('Role selection customId:', interaction.customId);

        // Extract sessionId and role from customId
        const parts = interaction.customId.split('-');
        const role = parts[parts.length - 1];
        const sessionId = parts.slice(2, -1).join('-'); // Join all parts between 'role' and the role name

        console.log('Extracted sessionId:', sessionId);
        console.log('Extracted role:', role);

        if (!sessionId || !role) {
            console.log('Invalid customId format');
            await interaction.reply({
                content: 'Invalid session selection. Please try again.',
                ephemeral: true
            });
            didError = true;
            return;
        }

        const session = await provider.session.findUnique({
            where: { id: sessionId }
        });

        if (!session) {
            console.log('Session not found:', sessionId);
            await interaction.reply({
                content: 'This session no longer exists.',
                ephemeral: true
            });
            didError = true;
            return;
        }

        // Check if session has started using Athens time
        const nowAthens = toZonedTime(new Date(), TIME_ZONE);
        const sessionTimeAthens = toZonedTime(session.date, TIME_ZONE);

        if (nowAthens.getTime() > sessionTimeAthens.getTime()) {
            await interaction.reply({
                content: 'This session has already started.',
                ephemeral: true
            });
            didError = true;
            return;
        }

        // Check if someone else claimed this role while user was selecting
        const existingClaim = await provider.session.findFirst({
            where: {
                time: session.time,
                date: session.date,
                role: role,
                status: 'claimed'
            }
        });

        if (existingClaim) {
            await interaction.reply({
                content: `This role has already been claimed for this session.`,
                ephemeral: true
            });
            didError = true;
            return;
        }

        // Create a new session claim for this role
        await provider.session.create({
            data: {
                time: session.time,
                date: session.date,
                status: 'claimed',
                claimedBy: interaction.user.id,
                role: role
            }
        });

        await interaction.update({
            content: `You have claimed this session as ${role}.`,
            components: []
        });
    } catch (error) {
        console.error('Error in handleSessionRoleSelect:', error);
        if (!didError) {
            await interaction.reply({
                content: 'An error occurred while processing your request.',
                ephemeral: true
            });
        }
    } finally {
        await refreshSessionsEmbed(interaction);
    }
};

const refreshSessionsEmbed = async (interaction: ButtonInteraction) => {
    try {
        // Get Athens time
        const nowAthens = toZonedTime(new Date(), TIME_ZONE);
        const today = new Date(nowAthens.getFullYear(), nowAthens.getMonth(), nowAthens.getDate());
        
        // Get the day of week (0 = Sunday, 1 = Monday, etc.)
        const dayOfWeek = today.getDay();
        
        // Calculate days from today to Friday (5)
        const daysToFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 5 + (7 - dayOfWeek);
        
        // Create array of dates from today through Friday
        const weekDates = [];
        for (let i = 0; i <= daysToFriday; i++) {
            weekDates.push(new Date(today.getTime() + i * 24 * 60 * 60 * 1000));
        }

        const allEmbeds = [];

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

            // Group sessions by time+date as a unique key
            const sessionsByTime = sessions.reduce<Record<string, SessionTimeSlot>>((acc: Record<string, SessionTimeSlot>, session) => {
                const key = `${session.time}_${session.date.toISOString()}`;
                if (!acc[key]) {
                    acc[key] = {
                        id: session.id,
                        time: session.time,
                        date: session.date,
                        claims: []
                    };
                }
                if (session.status === 'claimed' && session.claimedBy && session.role) {
                    acc[key].claims.push({
                        role: session.role,
                        claimedBy: session.claimedBy
                    });
                }
                return acc;
            }, {} as Record<string, SessionTimeSlot>);

            // Create embed for this day
            const embed = new EmbedBuilder()
                .setTitle(`${format(baseDate, 'EEEE do MMMM')} (EET)`)
                .setColor('#57F287');

            // Sort time slots chronologically
            const sortedTimeSlots = (Object.values(sessionsByTime) as unknown as SessionTimeSlot[])
                .sort((a, b) => a.date.getTime() - b.date.getTime());

            // Add fields for each time slot
            sortedTimeSlots.forEach((timeSlot: SessionTimeSlot) => {
                const statusEmoji = timeSlot.claims.length > 0 ? '🟢' : '🔴';
                const roleOrder = { 'Host': 0, 'Trainer': 1, 'Assistant': 2 } as const;
                const sortedClaims = timeSlot.claims.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
                let claimsText;
                if (sortedClaims.length === 0) {
                    claimsText = '> - No claims yet';
                } else {
                    claimsText = sortedClaims.map(claim => 
                        `> - <@${claim.claimedBy}> (${claim.role})`
                    ).join('\n');
                }
                const timestamp = Math.floor(timeSlot.date.getTime() / 1000);
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

        // Create claim button
        const claimButton = new ButtonBuilder()
            .setCustomId('session-claim')
            .setLabel('Claim/Unclaim Session')
            .setStyle(ButtonStyle.Secondary);
        const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>()
            .addComponents(claimButton);

        // Find the original sessions message by ID
        let sessionsMessage = null;
        try {
            if (existsSync(SESSION_EMBED_PATH)) {
                const { messageId, channelId } = JSON.parse(readFileSync(SESSION_EMBED_PATH, 'utf-8'));
                const channel = await interaction.client.channels.fetch(channelId);
                if (channel && channel.isTextBased()) {
                    sessionsMessage = await channel.messages.fetch(messageId);
                }
            }
        } catch (err) {
            console.error('Error fetching sessions message by ID:', err);
        }

        if (sessionsMessage && sessionsMessage.editable) {
            await sessionsMessage.edit({
                embeds: allEmbeds,
                components: [actionRow as any]
            });
        } else {
            console.error('Sessions message not found or not editable.');
        }
    } catch (error) {
        console.error('Error refreshing sessions embed:', error);
    }
};

export { handleInteraction };
