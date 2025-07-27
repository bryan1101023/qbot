import { Command } from '../../structures/Command';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageActionRowComponentBuilder, CommandInteraction } from 'discord.js';
import { pinkColor, greenColor, redColor, orangeColor } from '../../handlers/locale';
import { addRequest, getAllRequests } from '../../database/inactivity';
import { config } from '../../config';

class InactivityRequestCommand extends Command {
    constructor() {
        super({
            trigger: 'inactivity',
            description: 'Submit an inactivity notice request.',
            type: 'ChatInput',
            module: 'inactivity',
            args: [
                {
                    trigger: 'start-date',
                    description: 'Start date (MM/DD)',
                    type: 'String',
                },
                {
                    trigger: 'end-date',
                    description: 'End date (MM/DD)',
                    type: 'String',
                },
                {
                    trigger: 'reason',
                    description: 'Reason for inactivity',
                    type: 'String',
                },
            ],
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
        const { 'start-date': startDateStr, 'end-date': endDateStr, reason } = ctx.args;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const currentYear = now.getFullYear();

        // Parse MM/DD to Date (for this year, or next if already passed)
        function parseMMDD(str: string, year: number): Date | null {
            const match = str.match(/^(\d{2})\/(\d{2})$/);
            if (!match) return null;
            const month = parseInt(match[1], 10) - 1;
            const day = parseInt(match[2], 10);
            const date = new Date(year, month, day, 2, 0, 0, 0); // 2:00 AM
            return date;
        }

        let startDate = parseMMDD(startDateStr, currentYear);
        let endDate = parseMMDD(endDateStr, currentYear);
        if (!startDate || !endDate) {
            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setTitle('Invalid Date Format')
                        .setDescription('Please use MM/DD format for both dates.'),
                ],
                ephemeral: true,
            });
        }
        // If start date is before today, try next year
        if (startDate < today) startDate = parseMMDD(startDateStr, currentYear + 1);
        if (endDate < today) endDate = parseMMDD(endDateStr, currentYear + 1);
        if (!startDate || !endDate || startDate < today || endDate < today) {
            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setTitle('Invalid Date')
                        .setDescription('Start and end dates must be today or later.'),
                ],
                ephemeral: true,
            });
        }
        if (startDate >= endDate) {
            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(redColor)
                        .setTitle('Invalid Date Range')
                        .setDescription('The start date must be before the end date.'),
                ],
                ephemeral: true,
            });
        }

        // Check for pending request
        const pending = getAllRequests().find(r => r.userId === ctx.user.id && r.status === 'pending');
        if (pending) {
            const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
            const cancelRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`inactivity-cancel-${pending.messageId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
            );
            await ctx.reply({
                content: 'You cannot create a new inactivity request while you have a pending one, click cancel to cancel the pending inactivity request',
                components: [cancelRow.toJSON() as any],
                ephemeral: true,
            });
            return;
        }

        // Confirmation (ephemeral, direct interaction reply, handles defer)
        if (ctx.subject instanceof CommandInteraction) {
            if (ctx.deferred) {
                await ctx.subject.followUp({
                    content: 'You have submitted the inactivity request and you will be notified for the status of your request in direct messages!',
                    ephemeral: true,
                });
            } else {
                await ctx.subject.reply({
                    content: 'You have submitted the inactivity request and you will be notified for the status of your request in direct messages!',
                    ephemeral: true,
                });
            }
        } else {
            await ctx.reply({
                content: 'You have submitted the inactivity request and you will be notified for the status of your request in direct messages!',
            });
        }

        // Format dates for embed
        const startDateFmt = `<t:${Math.floor(startDate.getTime() / 1000)}:F> (<t:${Math.floor(startDate.getTime() / 1000)}:R>)`;
        const endDateFmt = `<t:${Math.floor(endDate.getTime() / 1000)}:F> (<t:${Math.floor(endDate.getTime() / 1000)}:R>)`;

        // Create action row with approve/deny buttons
        const actionRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('inactivity-approve')
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('inactivity-deny')
                .setLabel('Deny')
                .setStyle(ButtonStyle.Danger),
        );

        // Send embed to review channel
        const reviewEmbed = new EmbedBuilder()
            .setTitle('Inactivity Notice Request')
            .setColor(pinkColor)
            .addFields(
                { name: 'User', value: `<@${ctx.user.id}> (${ctx.user.id})`, inline: false },
                { name: 'Start Date', value: startDateFmt, inline: false },
                { name: 'End Date', value: endDateFmt, inline: false },
                { name: 'IN Reason', value: reason, inline: false },
                { name: 'Status', value: 'Awaiting review...', inline: false },
            );

        const channel = ctx.guild.channels.cache.get('1383774384333918328');
        let reviewMsg;
        if (channel && channel.isTextBased()) {
            reviewMsg = await channel.send({ embeds: [reviewEmbed], components: [actionRow.toJSON()] as any });
        }

        // Save to database
        if (reviewMsg) {
            addRequest({
                userId: ctx.user.id,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                reason,
                status: 'pending',
                messageId: reviewMsg.id,
                createdAt: new Date().toISOString(),
            });
        }

        // Awaiting review embed (to user, as DM)
        const awaitingEmbed = new EmbedBuilder()
            .setTitle('Awaiting Review - Inactivity Notice Request')
            .setColor(orangeColor)
            .setDescription('Your request has been sent to the Staffing Department and is awaiting review, please remain patient during that time, if your request hasn\'t been reviewed within **24 hours** then you can DM a Staffing member to assist you.');
        await ctx.user.send({ embeds: [awaitingEmbed] });
    }
}

export default InactivityRequestCommand; 