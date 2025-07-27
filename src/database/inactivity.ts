import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, 'inactivityRequests.json');

export type InactivityRequestStatus = 'pending' | 'approved' | 'denied';

export interface InactivityRequest {
    userId: string;
    startDate: string; // ISO string
    endDate: string;   // ISO string
    reason: string;
    status: InactivityRequestStatus;
    moderatorId?: string;
    messageId: string;
    createdAt: string; // ISO string
}

function loadDB(): InactivityRequest[] {
    try {
        const data = readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveDB(requests: InactivityRequest[]) {
    writeFileSync(DB_PATH, JSON.stringify(requests, null, 2), 'utf-8');
}

export function getAllRequests(): InactivityRequest[] {
    return loadDB();
}

export function addRequest(req: InactivityRequest) {
    const db = loadDB();
    db.push(req);
    saveDB(db);
}

export function updateRequestStatus(messageId: string, status: InactivityRequestStatus, moderatorId: string) {
    const db = loadDB();
    const req = db.find(r => r.messageId === messageId);
    if (req) {
        req.status = status;
        req.moderatorId = moderatorId;
        saveDB(db);
    }
}

export function getRequestByMessageId(messageId: string): InactivityRequest | undefined {
    return loadDB().find(r => r.messageId === messageId);
}

export function getInactivityStartingToday(): InactivityRequest[] {
    const db = loadDB();
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    
    return db.filter(req => {
        if (req.status !== 'approved') return false;
        
        const startDate = new Date(req.startDate);
        return startDate >= startOfDay && startDate < endOfDay;
    });
} 