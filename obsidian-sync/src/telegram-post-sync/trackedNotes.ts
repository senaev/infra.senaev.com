import type { TelegramPostTarget } from "./parseTelegramPostLink";

export type TrackedTarget = {
    /**
     * The exact frontmatter value this target came from. Kept so write-back can find the
     * item again — matching on the original text is stable under reordering, whereas a
     * positional index is not.
     */
    link: string;
    /** Either an existing post to rewrite, or a channel to publish into. */
    target: TelegramPostTarget;
};

export type TrackedNote = {
    /** Path relative to the vault root, used as the map key. */
    relativePath: string;
    /** One note can mirror into several posts; always at least one entry. */
    targets: TrackedTarget[];
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
