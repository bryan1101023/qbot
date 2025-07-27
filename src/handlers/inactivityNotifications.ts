import { Client, EmbedBuilder } from 'discord.js';
import { getInactivityStartingToday } from '../database/inactivity';

export async function sendInactivityNotifications(client: Client) {
    try {
        const inactivityRequests = getInactivityStartingToday();
        
        for (const request of inactivityRequests) {
            try {
                const user = await client.users.fetch(request.userId);
                const moderator = request.moderatorId ? await client.users.fetch(request.moderatorId).catch(() => null) : null;
                
                const embed = new EmbedBuilder()
                    .setTitle('Inactivity Notice Begins! 🎉')
                    .setColor('#57F287')
                    .setDescription(`Hey there, **${user.username}**!\n\nI'm Kusai's Assistant, I'm sure you've heard of me! Well, I'm here to notify you that your inactivity notice has officially begun! 🎉 Now, make sure to read the information below, violating any of the rules below will result in cancellation of your current inactivity notice.\n\n**Information**\n\n• **1.** Your inactivity reason was **"${request.reason}"** and it got approved by **${moderator ? moderator.username : 'Unknown Moderator'}**.\n\n• **2.** Following up, if you are found being active in other groups or lying about your inactivity notice, it will be cancelled and consequences will occur! You are not allowed to be active in other groups while you are on IN at Kusai Kitchen.\n\n• **3.** Finally, you are not allowed to conduct any alliance visits, claim any training roles including but not limited to Host, Trainer, Assistant, Spectator, etc.\n\nWe will wait for your return! Farewell!`)
                    .setTimestamp();

                await user.send({ embeds: [embed] });
                console.log(`Sent inactivity notification to ${user.username} (${user.id})`);
            } catch (error) {
                console.error(`Failed to send inactivity notification to user ${request.userId}:`, error);
            }
        }
        
        if (inactivityRequests.length > 0) {
            console.log(`Sent inactivity notifications to ${inactivityRequests.length} user(s)`);
        }
    } catch (error) {
        console.error('Error sending inactivity notifications:', error);
    }
} 