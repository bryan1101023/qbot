import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import {
    getInvalidRobloxUserEmbed,
    getRobloxUserIsNotMemberEmbed,
    getSuccessfulPromotionEmbed,
    getUnexpectedErrorEmbed,
    getNoRankAboveEmbed,
    getRoleNotFoundEmbed,
    getVerificationChecksFailedEmbed,
    getUserSuspendedEmbed,
} from '../../handlers/locale';
import { checkActionEligibility } from '../../handlers/verificationChecks';
import { config } from '../../config';
import { User, PartialUser, GroupMember } from 'bloxy/dist/structures';
import { logAction } from '../../handlers/handleLogging';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { provider } from '../../database';
import { CommandInteraction, Message } from 'discord.js';

class PromoteCommand extends Command {
    constructor() {
        super({
            trigger: 'promote',
            description: 'Promotes a user in the Roblox group.',
            type: 'ChatInput',
            module: 'ranking',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to promote?',
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
            ],
            shouldDefer: true
        });
    }

    async run(ctx: CommandContext) {
        function isInteraction(subject: any): subject is CommandInteraction {
            return subject && typeof subject === 'object' && 'editReply' in subject && typeof subject.editReply === 'function';
        }
        try {
            // Run these operations in parallel
            const [robloxUser, groupRoles] = await Promise.all([
                this.getRobloxUser(ctx.args['roblox-user']),
                robloxGroup.getRoles()
            ]);

            const edit = async (payload: any) => {
                if (isInteraction(ctx.subject)) {
                    return ctx.subject.editReply(payload);
                } else {
                    return ctx.subject.channel.send(payload);
                }
            };

            if (!robloxUser) {
                return edit({ embeds: [ getInvalidRobloxUserEmbed() ]});
            }

            // Get member info and user data in parallel
            const [robloxMember, userData] = await Promise.all([
                robloxGroup.getMember(robloxUser.id),
                provider.findUser(robloxUser.id.toString())
            ]);

            if (!robloxMember) {
                return edit({ embeds: [ getRobloxUserIsNotMemberEmbed() ]});
            }

            if (userData.suspendedUntil) {
                return edit({ embeds: [ getUserSuspendedEmbed() ] });
            }

            const currentRoleIndex = groupRoles.findIndex((role) => role.rank === robloxMember.role.rank);
            const role = groupRoles[currentRoleIndex + 1];

            if (!role) {
                return edit({ embeds: [ getNoRankAboveEmbed() ]});
            }

            if (role.rank > config.maximumRank || robloxMember.role.rank > config.maximumRank) {
                return edit({ embeds: [ getRoleNotFoundEmbed() ] });
            }

            if (config.verificationChecks) {
                const actionEligibility = await checkActionEligibility(ctx.user.id, ctx.guild.id, robloxMember, role.rank);
                if (!actionEligibility) {
                    return edit({ embeds: [ getVerificationChecksFailedEmbed() ] });
                }
            }

            // Update member and prepare success message in parallel
            const [, successEmbed] = await Promise.all([
                robloxGroup.updateMember(robloxUser.id, role.id),
                getSuccessfulPromotionEmbed(robloxUser, role.name)
            ]);

            await edit({ embeds: [ successEmbed ]});
            // Log action after sending response
            logAction('Promote', ctx.user, ctx.args['reason'], robloxUser, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
        } catch (err: any) {
            console.log('Promote error:', err);
            const edit = async (payload: any) => {
                if (isInteraction(ctx.subject)) {
                    return ctx.subject.editReply(payload);
                } else {
                    return ctx.subject.channel.send(payload);
                }
            };
            if (err.statusCode === 403) {
                return edit({ content: '❌ The bot does not have permission to promote this user. Please check the bot\'s permissions and group rank.' });
            }
            if (err.statusCode === 404) {
                return edit({ content: '❌ The user or role was not found. Please check the username/ID and try again.' });
            }
            return edit({ embeds: [ getUnexpectedErrorEmbed() ]});
        }
    }

    private async getRobloxUser(input: string | number): Promise<User | PartialUser | null> {
        try {
            // Try direct user ID first
            if (typeof input === 'number') {
                return await robloxClient.getUser(input);
            }

            // Try username
            const robloxUsers = await robloxClient.getUsersByUsernames([input as string]);
            if (robloxUsers.length > 0) {
                return robloxUsers[0];
            }

            // Try Discord ID
            const idQuery = input.replace(/[^0-9]/gm, '');
            const discordUser = await discordClient.users.fetch(idQuery);
            return await getLinkedRobloxUser(discordUser.id);
        } catch (err) {
            return null;
        }
    }
}

export default PromoteCommand;
