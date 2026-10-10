// The limits of the code tools. code-tools enforces them, and cluster-helper shows them to
// ChatGPT in the tool schemas and descriptions, so both read them from here.

export const MAX_GLOB_LENGTH = 200;

export const LIST_LIMITS = {
    defaultLimit: 200,
    maxLimit: 500,
    maxOffset: 1_000_000,
} as const;

export const SEARCH_LIMITS = {
    maxQueries: 10,
    maxQueryLength: 300,
    defaultLimit: 20,
    maxLimit: 50,
    defaultMatchesPerFile: 5,
    maxMatchesPerFile: 30,
    defaultContextLines: 1,
    maxContextLines: 5,
    maxOffset: 100_000,
} as const;

export const READ_LIMITS = {
    maxPaths: 20,
    maxCharsPerFile: 30_000,
    maxCharsPerResponse: 50_000,
} as const;

export const WRITE_LIMITS = {
    maxContentChars: 500_000,
} as const;

export const PATCH_LIMITS = {
    maxOperations: 20,
} as const;

export const RUN_LIMITS = {
    maxCommandLength: 10_000,
    defaultTimeoutSeconds: 60,
    maxTimeoutSeconds: 300,
    /** For stdout and stderr together; the end of the output is kept, because errors are there. */
    maxOutputChars: 30_000,
} as const;

export const CLONE_LIMITS = {
    maxUrlLength: 500,
    timeoutSeconds: 300,
} as const;
