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
} as const;

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
