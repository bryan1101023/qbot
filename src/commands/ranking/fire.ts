import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import {
    getInvalidRobloxUserEmbed,
    getRobloxUserIsNotMemberEmbed,
    getSuccessfulFireEmbed,
    getUnexpectedErrorEmbed,
    getVerificationChecksFailedEmbed,
    getAlreadyFiredEmbed,
    getRoleNotFoundEmbed,
    noFiredRankLog,
    getUserSuspendedEmbed,
} from '../../handlers/locale';
import { checkActionEligibility } from '../../handlers/verificationChecks';
import { config } from '../../config';
import { User, PartialUser, GroupMember } from 'bloxy/dist/structures';
import { logAction } from '../../handlers/handleLogging';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { provider } from '../../database';
import { CommandInteraction, Message } from 'discord.js';

class FireCommand extends Command {
    constructor() {
        super({
            trigger: 'fire',
            description: 'Sets a users rank in the Roblox group to 1.',
            type: 'ChatInput',
            module: 'ranking',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to fire?',
                    autocomplete: true,
                    type: 'RobloxUser',
                },
                {
                    trigger: 'reason',
                    description: 'If you would like a reason to be supplied in the logs, put it here.',
                    isLegacyFlag: true,
                    required: false,
                    type: 'String',
                },
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.ranking,
                    value: true,
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        let robloxUser: User | PartialUser;
        function isInteraction(subject: any): subject is CommandInteraction {
            return subject && typeof subject === 'object' && 'editReply' in subject && typeof subject.editReply === 'function';
        }
        try {
            robloxUser = await robloxClient.getUser(ctx.args['roblox-user'] as number);
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
                    if (isInteraction(ctx.subject)) {
                        return ctx.subject.editReply({ embeds: [ getInvalidRobloxUserEmbed() ]});
                    } else {
                        return ctx.subject.channel.send({ embeds: [ getInvalidRobloxUserEmbed() ]});
                    }
                }
            }
        }

        let robloxMember: GroupMember;
        try {
            robloxMember = await robloxGroup.getMember(robloxUser.id);
            if(!robloxMember) throw new Error();
        } catch (err) {
            if (isInteraction(ctx.subject)) {
                return ctx.subject.editReply({ embeds: [ getRobloxUserIsNotMemberEmbed() ]});
            } else {
                return ctx.subject.channel.send({ embeds: [ getRobloxUserIsNotMemberEmbed() ]});
            }
        }

        const edit = async (payload: any) => {
            if (isInteraction(ctx.subject)) {
                return ctx.subject.editReply(payload);
            } else {
                return ctx.subject.channel.send(payload);
            }
        };
        if(robloxMember.role.rank > config.maximumRank) return edit({ embeds: [ getRoleNotFoundEmbed() ] });

        if(config.verificationChecks) {
            const actionEligibility = await checkActionEligibility(ctx.user.id, ctx.guild.id, robloxMember, 0);
            if(!actionEligibility) return edit({ embeds: [ getVerificationChecksFailedEmbed() ] });
        }

        const userData = await provider.findUser(robloxUser.id.toString());
        if(userData.suspendedUntil) return edit({ embeds: [ getUserSuspendedEmbed() ] });

        try {
            await robloxGroup.updateMember(robloxUser.id, 1); // 1 is usually the 'Guest' or 'Removed' rank
            await edit({ content: `✅ Successfully removed <@${ctx.args['roblox-user']}> from the group.` });
            logAction('Fire', ctx.user, ctx.args['reason'], robloxUser, `${robloxMember.role.name} (${robloxMember.role.rank}) → Removed (1)`);
        } catch (err: any) {
            console.log('Fire error:', err);
            if (err.statusCode === 403) {
                return edit({ content: '❌ The bot does not have permission to remove this user. Please check the bot\'s permissions and group rank.' });
            }
            if (err.statusCode === 404) {
                return edit({ content: '❌ The user was not found. Please check the username/ID and try again.' });
            }
            return edit({ content: 'An unexpected error occurred while removing the user.' });
        }
        // Ensure reply if not already replied
        if (!ctx.replied) {
            await edit({ content: 'An unknown error occurred.' });
        }
    }
}

export default FireCommand;
