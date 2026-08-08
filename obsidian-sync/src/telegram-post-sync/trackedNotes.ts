import type { TelegramPostRef } from "./parseTelegramPostLink";

export type TrackedNote = TelegramPostRef & {
    /** Path relative to the vault root, used as the map key. */
    relativePath: string;
    /** Last observed modification time of the note file. */
    mtimeMs: number;
};

// The up-to-date set of notes carrying a `telegram-post-clone` parameter. Populated by the
// initial vault scan and kept current by the watcher. Untracking simply drops the entry —
// the Telegram post itself is deliberately left untouched.
const trackedNotes = new Map<string, TrackedNote>();

export function setTrackedNote(note: TrackedNote): void {
    trackedNotes.set(note.relativePath, note);
}

export function getTrackedNote(relativePath: string): TrackedNote | undefined {
    return trackedNotes.get(relativePath);
}

export function deleteTrackedNote(relativePath: string): boolean {
    return trackedNotes.delete(relativePath);
}

export function listTrackedNotes(): TrackedNote[] {
    return [...trackedNotes.values()];
}
