import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { PartialUser, User, GroupMember } from 'bloxy/dist/structures';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { config } from '../../config';
import {
    getInvalidRobloxUserEmbed,
    getNoDatabaseEmbed,
    getPartialUserInfoEmbed,
    getRobloxUserIsNotMemberEmbed,
    getUnexpectedErrorEmbed,
} from '../../handlers/locale';
import { provider } from '../../database';
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';

class ActivityCommand extends Command {
    constructor() {
        super({
            trigger: 'activity',
            description: 'Displays a player\'s in-game activity statistics.',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to view the activity of?',
                    required: false,
                    type: 'String',
                },
            ]
        });
    }

    async run(ctx: CommandContext) {
        let robloxUser: User | PartialUser;
        try {
            if(ctx.args['roblox-user']) {
                robloxUser = await robloxClient.getUser(ctx.args['roblox-user'] as number);
            } else {
                robloxUser = await getLinkedRobloxUser(ctx.user.id);
            }
            if(!robloxUser) throw new Error();
        } catch (err) {
            try {
                const robloxUsers = await robloxClient.getUsersByUsernames([ ctx.args['roblox-user'] as string ]);
                if(robloxUsers.length === 0) throw new Error();
                robloxUser = robloxUsers[0];
            } catch (err) {
                try {
                    const idQuery = ctx.args['roblox-user'].replace(/[^0-9]/gm, '');
                    const discordUser = await discordClient.users.fetch(idQuery);
                    const linkedUser = await getLinkedRobloxUser(discordUser.id);
                    if(!linkedUser) throw new Error();
                    robloxUser = linkedUser;
                } catch (err) {
                    return ctx.reply({ embeds: [ getInvalidRobloxUserEmbed() ]});
                }
            }
        }

        const userData = await provider.findUser(robloxUser.id.toString());

        // Check if user is a group member
        let robloxMember: GroupMember;
        try {
            robloxMember = await robloxGroup.getMember(robloxUser.id);
            if(!robloxMember) throw new Error();
        } catch (err) {
            return ctx.reply({ embeds: [ await getPartialUserInfoEmbed(robloxUser, userData) ]});
        }

        // Get user avatar
        const avatarUrl = (await robloxClient.apis.thumbnailsAPI.getUsersAvatarHeadShotImages({ 
            userIds: [ robloxUser.id ], 
            size: '150x150', 
            format: 'png', 
            isCircular: false 
        })).data[0].imageUrl;

        // Create activity embed
        const embed = new EmbedBuilder()
            .setTitle(`${robloxUser.name}'s Activity`)
            .setColor('#2f3136')
            .setDescription(
                `> • **${userData.weeklyActivityMinutes}** minutes in-game this week\n` +
                `> • **${userData.monthlyActivityMinutes}** minutes in-game this month\n\n` +
                `Weekly activity is reset every Monday and monthly activity resets every 1st`
            )
            .setThumbnail(avatarUrl)
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
}

export default ActivityCommand; 