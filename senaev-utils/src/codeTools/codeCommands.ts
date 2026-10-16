/** Domain argument contracts; independent of transport and execution policy. */
export const CODE_COMMAND_ARGUMENTS = {
    projects: [],
    list: [
        'project',
        'folder',
        'glob',
        'recursive',
        'offset',
        'limit',
    ],
    search: [
        'project',
        'queries',
        'regex',
        'caseSensitive',
        'folder',
        'glob',
        'contextLines',
        'maxMatchesPerFile',
        'offset',
        'limit',
    ],
    read: [
        'project',
        'paths',
        'startLine',
        'lineCount',
    ],
    write: [
        'project',
        'path',
        'content',
        'expectedHash',
    ],
    patch: [
        'project',
        'path',
        'expectedHash',
        'operations',
    ],
    run: [
        'project',
        'command',
    ],
} as const;

export type CodeCommandName = keyof typeof CODE_COMMAND_ARGUMENTS;

/** Projects are plain folder names, never root-relative paths. */
export const PROJECT_NAME_PATTERN = '^[A-Za-z0-9_][A-Za-z0-9._-]*$';
