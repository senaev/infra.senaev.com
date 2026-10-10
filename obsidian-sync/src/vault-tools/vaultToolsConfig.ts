/**
 * What the vault tools can see. Everything excluded here is invisible to every tool, for
 * reads and writes alike. Per-tool response limits live next to each tool.
 */
export type VaultToolsConfig = {
    root: string;
    noteExtension: string;
    /** Vault-relative folders, excluded with everything below them. */
    excludedFolders: readonly string[];
    /** Folder names excluded at any depth. Dot-prefixed names are always excluded too. */
    excludedFolderNames: readonly string[];
    excludedFileSuffixes: readonly string[];
    /** Holds the diary entries, one `YYYY-MM-DD.md` file per day. */
    diaryFolder: string;
    /** Receives the records of `diary_append`; the owner moves them into daily notes by hand. */
    diaryDraftPath: string;
};

/** A factory rather than a constant, so tests can apply the same rules to a temporary vault. */
export function createVaultToolsConfig(root: string): VaultToolsConfig {
    return {
        root,
        noteExtension: '.md',
        excludedFolders: ['plugins'],
        // `.obsidian`, `.trash` and `.git` are covered by the dot-prefix rule.
        excludedFolderNames: ['node_modules'],
        // Excalidraw drawings are JSON scene data saved as markdown, not text.
        excludedFileSuffixes: ['.excalidraw.md'],
        diaryFolder: 'periodic/day',
        diaryDraftPath: '@senaev/daily_note_draft.md',
    };
}
