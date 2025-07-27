import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import {
    getUnexpectedErrorEmbed,
    mainColor,
} from '../../handlers/locale';
import { config } from '../../config';
import { EmbedBuilder } from 'discord.js';
import { logAction } from '../../handlers/handleLogging';

class AnnounceCommand extends Command {
    constructor() {
        super({
            trigger: 'announce',
            description: 'Posts a training session announcement in Discord.',
            type: 'ChatInput',
            module: 'ANNOUNCEMENTS',
            args: [],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.shout,
                    value: true,
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        try {
            const channelId = '1383706823466553405';
            const channel = await discordClient.channels.fetch(channelId);
            
            if (!channel || !channel.isTextBased()) {
                return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ] });
            }

            const announceEmbed = new EmbedBuilder()
                .setColor(mainColor)
                .setTitle('🎯 Training Session Announcement')
                .setDescription(`Hey, @here! I'm excited to announce that a training session is being hosted. If you are a Trainee, you may attend for a promotion and any staff member can participate to get promoted or refresh their memory!`)
                .addFields({
                    name: '🔗 Training Center',
                    value: '[Join Training Center](https://www.roblox.com/games/124107147352411/Training-Center)',
                    inline: false
                })
                .setTimestamp()
                .setFooter({ text: 'Kusai Kitchen Training Center' });

            await channel.send({ content: '@here', embeds: [announceEmbed] });
            
            // Post Roblox group shout
            await robloxGroup.updateShout('🌴 TRAINING | A training session is being hosted now. Head down to our training center if you wish to rank up! (Trainee+)');
            
            ctx.reply({ 
                embeds: [ new EmbedBuilder()
                    .setColor(mainColor)
                    .setDescription('✅ Training session announcement has been posted successfully!')
                    .setTimestamp()
                ],
                ephemeral: true
            });
            
            logAction('Training Announcement', ctx.user, null, null, null, null, 'Training session announcement posted');
        } catch (err) {
            console.log(err);
            return ctx.reply({ embeds: [ getUnexpectedErrorEmbed() ]});
        }
    }
}

export default AnnounceCommand;
