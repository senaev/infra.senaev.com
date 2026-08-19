// Fingerprint of what was last successfully pushed, per note. Deliberately process memory
// and nothing more.
//
// This started life as a `telegram-post-clone-hash` frontmatter key, which was a mistake: it
// made this service rewrite every mirrored note on every content change, so its writes raced
// the user's own edits through Obsidian Sync. Sync resolves that race by patching one side's
// diff onto the other, or by overwriting outright when it sees no conflict — either way a
// value we had just written could silently revert, and the user's text was one unlucky
// interleaving away from going the same way.
//
// Keeping it here costs a re-push of every tracked note after a restart, since the map starts
// empty. Telegram answers those with "message is not modified", so they are cheap and
// invisible. That is a far better trade than writing to notes somebody is typing in.
const pushedNoteHashes = new Map<string, string>();

export function getPushedNoteHash(relativePath: string): string | undefined {
    return pushedNoteHashes.get(relativePath);
}

export function setPushedNoteHash(relativePath: string, hash: string): void {
    pushedNoteHashes.set(relativePath, hash);
}

/** Called when a note stops being tracked, so re-adding the key pushes it again. */
export function deletePushedNoteHash(relativePath: string): void {
    pushedNoteHashes.delete(relativePath);
}
