import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types'; 

export const config: BotConfig = {
    groupId: 986728241,
    slashCommands: true,
    legacyCommands: {
        enabled: false,
        prefixes: ['q!'],
    },
    permissions: {
        all: ['1383706624455348274'],
        ranking: [''],
        users: [''],
        shout: [''],
        join: [''],
        signal: [''],
        admin: [''],
        sessions: ['1383706624455348274'],
    },
    logChannels: {
        actions: '1388350472326352957',
        shout: '1388350472326352957',
    },
    api: true,
    maximumRank: 255,
    verificationChecks: true,
    bloxlinkGuildId: '1369636801702264873',
    firedRank: 1,
    suspendedRank: 1,
    recordManualActions: true,
    memberCount: {
        enabled: false,
        channelId: '',
        milestone: 100,
        onlyMilestones: false,
    },
    xpSystem: {
        enabled: false,
        autoRankup: false,
        roles: [],
    },
    antiAbuse: {
        enabled: true,
        clearDuration: 1 * 60,
        threshold: 10,
        demotionRank: 1,
    },
    activity: {
        enabled: true,
        type: ActivityType.Watching,
        value: 'over Kusai Kitchen.',
    },
    status: 'online',
    deleteWallURLs: false,
}
