import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import {
    getInvalidRobloxUserEmbed,
    getRobloxUserIsNotMemberEmbed,
    getSuccessfulUnsuspendEmbed,
    getUnexpectedErrorEmbed,
    getVerificationChecksFailedEmbed,
    getRoleNotFoundEmbed,
    getNotSuspendedEmbed,
    getAlreadySuspendedEmbed,
    noSuspendedRankLog,
    getNoDatabaseEmbed,
} from '../../handlers/locale';
import { checkActionEligibility } from '../../handlers/verificationChecks';
import { config } from '../../config';
import { User, PartialUser, GroupMember } from 'bloxy/dist/structures';
import { logAction } from '../../handlers/handleLogging';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { provider } from '../../database';
import { CommandInteraction } from 'discord.js';

class UnsuspendCommand extends Command {
    constructor() {
        super({
            trigger: 'unsuspend',
            description: 'Removes a suspension from a user, and ranks them back to their previous role.',
            type: 'ChatInput',
            module: 'suspensions',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to unsuspend?',
                    autocomplete: true,
                    type: 'String',
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
            const edit = async (payload: any) => {
                if (isInteraction(ctx.subject)) {
                    return ctx.subject.editReply(payload);
                } else {
                    return ctx.subject.channel.send(payload);
                }
            };

            let robloxUser: User | PartialUser;
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
                        return edit({ embeds: [ getInvalidRobloxUserEmbed() ]});
                    }
                }
            }

            let robloxMember: GroupMember;
            try {
                robloxMember = await robloxGroup.getMember(robloxUser.id);
                if(!robloxMember) throw new Error();
            } catch (err) {
                return edit({ embeds: [ getRobloxUserIsNotMemberEmbed() ]});
            }

            const userData = await provider.findUser(robloxUser.id.toString());
            if(!userData.suspendedUntil) {
                return edit({ embeds: [ getNotSuspendedEmbed() ] });
            }

            const groupRoles = await robloxGroup.getRoles();
            // Fix: Use unsuspendRank as role ID, not rank number
            const role = groupRoles.find((role) => role.id === userData.unsuspendRank);
            if(!role) {
                console.error(`Role with ID ${userData.unsuspendRank} not found`);
                return edit({ embeds: [ getUnexpectedErrorEmbed() ]});
            }
            if(role.rank > config.maximumRank || robloxMember.role.rank > config.maximumRank) {
                return edit({ embeds: [ getRoleNotFoundEmbed() ] });
            }

            if(config.verificationChecks) {
                const actionEligibility = await checkActionEligibility(ctx.user.id, ctx.guild.id, robloxMember, role.rank);
                if(!actionEligibility) {
                    return edit({ embeds: [ getVerificationChecksFailedEmbed() ] });
                }
            }

            await provider.updateUser(robloxUser.id.toString(), { suspendedUntil: null, unsuspendRank: null });

            try {
                // Update member and prepare success message in parallel
                const [, successEmbed] = await Promise.all([
                    robloxMember.role.id !== role.id ? robloxGroup.updateMember(robloxUser.id, role.id) : Promise.resolve(),
                    getSuccessfulUnsuspendEmbed(robloxUser, role.name)
                ]);
                
                await edit({ embeds: [ successEmbed ]});
                
                // Log the action
                logAction('Unsuspend', ctx.user, ctx.args['reason'], robloxUser, `${robloxMember.role.name} (${robloxMember.role.rank}) → ${role.name} (${role.rank})`);
            } catch (err) {
                console.error('Roblox API error in unsuspend:', err);
                return edit({ embeds: [ getUnexpectedErrorEmbed() ]});
            }
        } catch (err) {
            console.error('Unsuspend command error:', err);
            const edit = async (payload: any) => {
                if (isInteraction(ctx.subject)) {
                    return ctx.subject.editReply(payload);
                } else {
                    return ctx.subject.channel.send(payload);
                }
            };
            return edit({ embeds: [ getUnexpectedErrorEmbed() ]});
        }
    }
}

export default UnsuspendCommand;