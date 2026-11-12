/** Domain argument contracts; independent of transport and execution policy. */
export const CODE_COMMAND_ARGUMENTS = {
    list: [
        'folder',
        'glob',
        'recursive',
        'offset',
        'limit',
    ],
    search: [
        'folder',
        'queries',
        'regex',
        'caseSensitive',
        'glob',
        'contextLines',
        'maxMatchesPerFile',
        'offset',
        'limit',
    ],
    read: [
        'paths',
        'startLine',
        'lineCount',
    ],
    write: [
        'path',
        'content',
        'expectedHash',
    ],
    patch: [
        'path',
        'expectedHash',
        'operations',
    ],
    run: [
        'cwd',
        'command',
    ],
} as const;

export type CodeCommandName = keyof typeof CODE_COMMAND_ARGUMENTS;
