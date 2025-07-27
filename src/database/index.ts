import { PrismaClient } from '@prisma/client';
import { DatabaseUser } from '../structures/types';

class PrismaProvider {
    private client: PrismaClient;

    constructor() {
        this.client = new PrismaClient();
    }

    get user() {
        return this.client.user;
    }

    get session() {
        return this.client.session;
    }

    async findUser(robloxId: string): Promise<DatabaseUser> {
        let userData = await this.client.user.findUnique({ where: { robloxId } });
        if(!userData) userData = await this.client.user.create({ data: { robloxId } });
        return userData;
    }

    async findSuspendedUsers(): Promise<DatabaseUser[]> {
        return await this.client.user.findMany({ 
            where: { 
                OR: [
                    { suspendedUntil: { not: null } },
                    { unsuspendRank: { not: null } }
                ]
            } 
        });
    }

    async findBannedUsers(): Promise<DatabaseUser[]> {
        return await this.client.user.findMany({ where: { isBanned: true } });
    }

    async updateUser(robloxId: string, data: any) {
        let userData = await this.client.user.findUnique({ where: { robloxId } });
        if(!userData) userData = await this.client.user.create({ data: { robloxId } });

        return await this.client.user.update({ where: { robloxId }, data });
    }
}

const provider = new PrismaProvider();

export { provider };