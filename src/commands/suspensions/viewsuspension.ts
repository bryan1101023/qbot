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
    mainColor,
    getNoDatabaseEmbed,
} from '../../handlers/locale';
import { config } from '../../config';
import { provider } from '../../database';
import { EmbedBuilder } from 'discord.js';


class ViewSuspensionsCommand extends Command {
    constructor() {
        super({
            trigger: 'viewsuspensions',
            description: 'Allows the viewing of all concurrent suspensions.',
            type: 'ChatInput',
            module: 'SUSPENSIONS',
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.ranking,
                    value: true,
                }
            ],
        });
    }

    async run(ctx: CommandContext) {
        if(!provider) return ctx.reply({ embeds: [ getNoDatabaseEmbed() ] });
        let isThere;
        const suspensions = await provider.findSuspendedUsers();
        let mainEmbed = new EmbedBuilder();
        mainEmbed.setTimestamp();
        mainEmbed.setColor(mainColor);
        mainEmbed.setTitle('Current Suspensions');
        for (var i in suspensions) {
            isThere = true;
            const user = await robloxClient.getUser(suspensions[i].robloxId);

            mainEmbed.addFields({ name: user.name, value: `Expires on ${suspensions[i].suspendedUntil.toDateString()}` });
        }
        if (!isThere) mainEmbed.setDescription("**No Current Suspensions!**");
        return ctx.reply({embeds: [mainEmbed]});
    }
}

export default ViewSuspensionsCommand;