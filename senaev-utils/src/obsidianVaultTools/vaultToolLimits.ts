// The limits of the Obsidian vault tools. obsidian-sync enforces them, and cluster-helper
// shows them to ChatGPT in the tool schemas and descriptions, so both read them from here.

export const MAX_GLOB_LENGTH = 200;

export const LIST_LIMITS = {
    defaultLimit: 100,
    maxLimit: 200,
    maxOffset: 1_000_000,
} as const;

export const SEARCH_LIMITS = {
    maxQueries: 20,
    maxQueryLength: 200,
    defaultLimit: 20,
    maxLimit: 50,
    defaultMatchesPerFile: 5,
    maxMatchesPerFile: 20,
    defaultContextLines: 1,
    maxContextLines: 3,
    maxOffset: 100_000,
} as const;

export const READ_LIMITS = {
    maxPaths: 50,
    maxCharsPerNote: 20_000,
    maxCharsPerResponse: 30_000,
} as const;

export const LINKS_LIMITS = {
    defaultLimit: 100,
    maxLimit: 200,
    maxOffset: 1_000_000,
} as const;

export const PATCH_LIMITS = {
    maxOperations: 20,
} as const;

export const TASKS_LIST_LIMITS = {
    defaultLimit: 50,
    maxLimit: 200,
    maxOffset: 1_000_000,
} as const;

export const TASK_WRITE_LIMITS = {
    maxBlankLines: 10,
    maxDescriptionLength: 2_000,
    maxSourceLength: 100,
    maxRecurrenceLength: 100,
} as const;

/** The owner's time zone: "today" of the task tools and the default closed date. */
export const TASKS_TIME_ZONE = 'Europe/Madrid';

/** Where new tasks go when the user names no note, see "Adding tasks" in the vault's AGENTS.md. */
export const DEFAULT_TASKS_NOTE_PATH = '@senaev/tasks/tasks_stream.md';
