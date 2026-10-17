/** Domain argument contracts; independent of transport and execution policy. */
export const VAULT_COMMAND_ARGUMENTS = {
    list: [
        'folder',
        'glob',
        'diaryFrom',
        'diaryTo',
        'recursive',
        'offset',
        'limit',
    ],
    search: [
        'queries',
        'match',
        'wholeWord',
        'folder',
        'glob',
        'diaryFrom',
        'diaryTo',
        'contextLines',
        'maxMatchesPerFile',
        'sort',
        'offset',
        'limit',
    ],
    read: [
        'paths',
        'diaryFrom',
        'diaryTo',
        'section',
        'startChar',
        'lineNumbers',
    ],
    links: [
        'path',
        'direction',
        'offset',
        'limit',
    ],
    create: [
        'path',
        'content',
        'frontmatter',
    ],
    patch: [
        'path',
        'expectedHash',
        'operations',
    ],
    move: [
        'path',
        'newPath',
    ],
    diary_append: ['text'],
    tasks_list: [
        'dailyNote',
        'status',
        'priority',
        'queries',
        'match',
        'wholeWord',
        'dueFrom',
        'dueTo',
        'closedFrom',
        'closedTo',
        'folder',
        'glob',
        'offset',
        'limit',
    ],
    tasks_create: [
        'path',
        'expectedHash',
        'afterLine',
        'blankLinesBefore',
        'blankLinesAfter',
        'description',
        'source',
        'priority',
        'dueDate',
        'recurrence',
    ],
    tasks_update: [
        'path',
        'line',
        'expectedHash',
        'changes',
    ],
} as const;

/** The task fields that `tasks_update` can change. */
export const TASK_CHANGE_FIELDS = [
    'status',
    'description',
    'source',
    'priority',
    'dueDate',
    'closedDate',
    'recurrence',
] as const;

export type VaultCommandName = keyof typeof VAULT_COMMAND_ARGUMENTS;

/** The fields each patch operation type accepts, besides `type`. */
export const PATCH_OPERATION_FIELDS = {
    append: [
        'text',
        'section',
    ],
    replace: [
        'find',
        'replace',
    ],
    replaceSection: [
        'section',
        'content',
    ],
    setFrontmatter: ['properties'],
} as const;

export type PatchOperationType = keyof typeof PATCH_OPERATION_FIELDS;
