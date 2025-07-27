import { QbotClient } from './structures/QbotClient';
import { Client as RobloxClient } from 'bloxy';
import { handleInteraction } from './handlers/handleInteraction';
import { handleLegacyCommand } from './handlers/handleLegacyCommand';
import { config } from './config'; 
import { Group } from 'bloxy/dist/structures';
import { recordShout } from './events/shout';
import { checkSuspensions } from './events/suspensions';
import { recordAuditLogs } from './events/audit';
import { recordMemberCount } from './events/member';
import { clearActions } from './handlers/abuseDetection';
import { checkBans } from './events/bans';
import { checkWallForAds } from './events/wall';
import { sendInactivityNotifications } from './handlers/inactivityNotifications';
require('dotenv').config();

// [Ensure Setup]
if(!process.env.ROBLOX_COOKIE) {
    console.error('ROBLOX_COOKIE is not set in the .env file.');
    process.exit(1);
}

require('./database');
require('./api');

// [Clients]
const discordClient = new QbotClient();
discordClient.login(process.env.DISCORD_TOKEN);
const robloxClient = new RobloxClient({ credentials: { cookie: process.env.ROBLOX_COOKIE } });
let robloxGroup: Group = null;

(async () => {
    await robloxClient.login().catch(console.error);
    robloxGroup = await robloxClient.getGroup(config.groupId);
    
    // [Events]
    checkSuspensions();
    checkBans();
    if(config.logChannels.shout) recordShout();
    if(config.recordManualActions) recordAuditLogs();
    if(config.memberCount.enabled) recordMemberCount();
    if(config.antiAbuse.enabled) clearActions();
    if(config.deleteWallURLs) checkWallForAds();
})();

// [Handlers]
discordClient.on('interactionCreate', handleInteraction as any);
discordClient.on('messageCreate', handleLegacyCommand);

// Set up daily inactivity notification check (runs at 12:00 AM EET)
discordClient.once('ready', async () => {
    console.log('Bot is ready!');
    
    setInterval(async () => {
        const now = new Date();
        const athensTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Athens"}));
        
        // Check if it's midnight (00:00) in Athens time
        if (athensTime.getHours() === 0 && athensTime.getMinutes() === 0) {
            console.log('Running daily inactivity notification check...');
            await sendInactivityNotifications(discordClient);
        }
    }, 60000); // Check every minute
});

// [Module]
export { discordClient, robloxClient, robloxGroup };
