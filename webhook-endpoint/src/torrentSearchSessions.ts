import { randomBytes } from "node:crypto";
import { ProwlarrRelease } from "./prowlarr";

const SESSION_TTL_MS = 60 * 60 * 1000;

interface TorrentSearchSession {
    createdAt: number;
    query: string;
    releases: ProwlarrRelease[];
}

const sessions = new Map<string, TorrentSearchSession>();

function pruneExpiredSessions(): void {
    const expiresBefore = Date.now() - SESSION_TTL_MS;
    for (const [id, session] of sessions.entries()) {
        if (session.createdAt < expiresBefore) {
            sessions.delete(id);
        }
    }
}

export function createTorrentSearchSession({
    query,
    releases,
}: {
    query: string;
    releases: ProwlarrRelease[];
}): string {
    pruneExpiredSessions();
    const id = randomBytes(4).toString("hex");
    sessions.set(id, {
        createdAt: Date.now(),
        query,
        releases,
    });
    return id;
}

export function getTorrentSearchSession(id: string): TorrentSearchSession | undefined {
    pruneExpiredSessions();
    return sessions.get(id);
}
