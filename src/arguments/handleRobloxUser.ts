import { AutocompleteInteraction, APIApplicationCommandOptionChoice } from 'discord.js';
import { getLinkedRobloxUser } from '../handlers/accountLinks';
import { robloxClient, robloxGroup } from '../main';

const handleRobloxUser = async (interaction: AutocompleteInteraction, option: APIApplicationCommandOptionChoice) => {
    if(!option.value) {
        return await interaction.respond([]);
    }

    try {
        // First try to find by Roblox username
        const robloxQuery = await robloxClient.getUsersByUsernames([ option.value as string ]);
        const choices = [];

        if(robloxQuery.length > 0) {
            const robloxUser = await robloxQuery[0].getUser();
            choices.push({
                name: `🎮 ${robloxUser.name} (${robloxUser.id})`,
                value: robloxUser.id.toString(),
            });
        }

        // Then try to find by Discord username
        const discordUsers = await interaction.guild.members.search({
            query: option.value as string,
            limit: 3, // Limit to 3 users to avoid hitting the response timeout
        });

        if(discordUsers.size > 0) {
            for(const [, member] of discordUsers) {
                try {
                    const linkedRobloxUser = await getLinkedRobloxUser(member.id);
                    if(linkedRobloxUser) {
                        choices.push({
                            name: `💬 @${member.user.username}: ${linkedRobloxUser.name} (${linkedRobloxUser.id})`,
                            value: linkedRobloxUser.id.toString(),
                        });
                    }
                } catch (err) {
                    continue;
                }
            }
        }

        // Respond with whatever choices we found
        await interaction.respond(choices);
    } catch (err) {
        // If anything fails, respond with an empty list
        await interaction.respond([]);
    }
}

export { handleRobloxUser };
