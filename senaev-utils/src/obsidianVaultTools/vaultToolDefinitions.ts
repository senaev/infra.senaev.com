import {
    LINKS_LIMITS,
    LIST_LIMITS,
    MAX_GLOB_LENGTH,
    PATCH_LIMITS,
    READ_LIMITS,
    SEARCH_LIMITS,
} from './vaultToolLimits';

// The Obsidian vault tools as ChatGPT sees them. obsidian-sync serves each one as
// `POST /vault/<name>` and accepts exactly the argument keys of its input schema;
// cluster-helper lists them over MCP as `obsidian-<name>` and forwards the calls.

/** Every MCP tool name is this prefix followed by the vault tool name. */
export const OBSIDIAN_TOOL_PREFIX = 'obsidian-';

export type VaultToolDefinition = {
    title: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: readonly string[];
        additionalProperties: false;
    };
    annotations: {
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
    };
};

function formatNumber(value: number): string {
    return value.toLocaleString('en-US');
}

// The rules themselves live only in the vault's AGENTS.md. MCP `instructions` were tried and
// dropped: ChatGPT read AGENTS.md through this sentence anyway (see
// tasks/2026-10-10-obsidian-mcp-vault-rules-and-diary-tool.md in infra.senaev.com).
const VAULT_RULES = 'If the vault rules from the root AGENTS.md are not in your context, read AGENTS.md with obsidian-read first.';

const DIARY_RANGE_PROPERTIES = {
    diaryFrom: {
        type: 'string',
        description: 'First diary day to include, YYYY-MM-DD. Diary entries are the notes periodic/day/YYYY-MM-DD.md.',
    },
    diaryTo: {
        type: 'string',
        description: 'Last diary day to include, YYYY-MM-DD.',
    },
};

const SCOPE_PROPERTIES = {
    folder: {
        type: 'string',
        description: 'Vault-relative folder to limit the scope to, e.g. "_people". Default: the whole vault.',
    },
    glob: {
        type: 'string',
        maxLength: MAX_GLOB_LENGTH,
        description: 'File name pattern, e.g. "*.md" or "2026-*". A pattern with "/" is matched against the vault-relative path, e.g. "places/**/*.md".',
    },
    ...DIARY_RANGE_PROPERTIES,
};

function pagingProperties(
    {
        defaultLimit, maxLimit, maxOffset,
    }: { defaultLimit: number; maxLimit: number; maxOffset: number },
    { items, offsetDescription }: { items: string; offsetDescription?: string }
) {
    return {
        offset: {
            type: 'integer',
            minimum: 0,
            maximum: maxOffset,
            ...offsetDescription !== undefined && { description: offsetDescription },
        },
        limit: {
            type: 'integer',
            minimum: 1,
            maximum: maxLimit,
            description: `${items} per page. Default: ${defaultLimit}. A larger value is reduced to ${maxLimit}.`,
        },
    };
}

const READ_ONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

const list: VaultToolDefinition = {
    title: 'List Obsidian notes',
    description: [
        'Lists notes (.md files) and folders in the owner\'s Obsidian vault.',
        'Without filters it lists one folder level. With "recursive", "glob" or a diary range it lists matching notes at any depth.',
        'Use a diary range to find the diary entries of a period before you read them.',
        'The result is paged: when "nextOffset" is not null, call again with "offset" set to it.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...SCOPE_PROPERTIES,
            recursive: {
                type: 'boolean',
                description: 'List notes in all subfolders, not only one level.',
            },
            ...pagingProperties(LIST_LIMITS, { items: 'Entries' }),
        },
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const search: VaultToolDefinition = {
    title: 'Search Obsidian notes',
    description: [
        'Full-text search in all notes of the owner\'s Obsidian vault, including frontmatter and note titles.',
        'Each query is literal text, case-insensitive, matched as a substring; there are no regular expressions.',
        'The notes are written in English, Spanish and Russian, so send several queries in one call: each language, synonyms and word forms (e.g. "climbing", "escalada", "скалолаз").',
        `Up to ${SEARCH_LIMITS.maxQueries} queries per call. Before you write a note or a diary record, collect the people, places and concepts it mentions and look them all up in one call`,
        '(several spellings and languages each), so that you link only to notes that exist.',
        'Results are grouped by file with line numbers and context; read a note with obsidian-read to see the full text.',
        'The whole scope is always scanned: "matchedFiles" and "totalHits" are exact even when the results are paged ("nextOffset") or "truncated".',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            queries: {
                type: 'array',
                items: {
                    type: 'string',
                    minLength: 1,
                    maxLength: SEARCH_LIMITS.maxQueryLength,
                },
                minItems: 1,
                maxItems: SEARCH_LIMITS.maxQueries,
                description: 'Literal texts to find.',
            },
            match: {
                type: 'string',
                enum: [
                    'any',
                    'all',
                ],
                description: '"any" (default): a file matches if it contains at least one query. "all": it must contain every query, anywhere in the file.',
            },
            wholeWord: {
                type: 'boolean',
                description: 'Match whole words only. Default: false, which also finds word forms that start with the query.',
            },
            ...SCOPE_PROPERTIES,
            contextLines: {
                type: 'integer',
                minimum: 0,
                maximum: SEARCH_LIMITS.maxContextLines,
                description: `Lines of context before and after each match. Default: ${SEARCH_LIMITS.defaultContextLines}.`,
            },
            maxMatchesPerFile: {
                type: 'integer',
                minimum: 1,
                maximum: SEARCH_LIMITS.maxMatchesPerFile,
                description: `Default: ${SEARCH_LIMITS.defaultMatchesPerFile}. "omittedMatches" tells how many more a file has.`,
            },
            sort: {
                type: 'string',
                enum: [
                    'relevance',
                    'path',
                ],
                description: 'Default: "path" (which is date order for diary entries) when a diary range is given, else "relevance".',
            },
            ...pagingProperties(SEARCH_LIMITS, { items: 'Files' }),
        },
        required: ['queries'],
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const read: VaultToolDefinition = {
    title: 'Read Obsidian notes',
    description: [
        'Reads notes from the owner\'s Obsidian vault: the full text, the parsed frontmatter, and a "hash" that obsidian-patch needs to edit the note.',
        `Give either "paths" or a diary range. One response holds at most ${formatNumber(READ_LIMITS.maxCharsPerResponse)} characters and whole notes only:`,
        'continue with "remainingPaths" (paths read) or with "diaryFrom" set to "nextDiaryFrom" (diary range read).',
        `A note longer than ${formatNumber(READ_LIMITS.maxCharsPerNote)} characters is cut with "truncated": true; read the rest with "startChar" set to "nextStartChar", or read one section.`,
        'Everything you read stays in the conversation, so to summarise a long diary range, read and summarise it in parts (e.g. one month at a time) and then combine the summaries.',
        'Cite the source notes by their path or date.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            paths: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: READ_LIMITS.maxPaths,
                description: 'Vault-relative note paths, e.g. "_people/@luli.md".',
            },
            ...DIARY_RANGE_PROPERTIES,
            section: {
                type: 'string',
                description: 'Read only the section under this heading. Use a heading path such as "Week 3 > Notes" when the heading is not unique. Only with exactly one path.',
            },
            startChar: {
                type: 'integer',
                minimum: 0,
                description: 'Continue a truncated note from this character. Only with exactly one path.',
            },
        },
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const links: VaultToolDefinition = {
    title: 'Obsidian note links',
    description: [
        'Returns the outgoing links of a note and its backlinks. Backlinks are found by scanning the whole vault and are grouped by the note that links,',
        'with the number of links and their line numbers; the list of linking notes is paged ("nextOffset").',
        'Wikilinks, embeds, Markdown links, heading (#) and block (^) references are included; links in code are not.',
        'A target is never guessed: "ambiguous" lists every note it can mean, "unresolved" means no such note,',
        'and "alias" means it matches only the frontmatter aliases of a note, which Obsidian itself does not resolve.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Vault-relative note path.',
            },
            direction: {
                type: 'string',
                enum: [
                    'outgoing',
                    'backlinks',
                    'both',
                ],
                description: 'Default: "both".',
            },
            ...pagingProperties(LINKS_LIMITS, {
                items: 'Linking notes',
                offsetDescription: 'First linking note to return.',
            }),
        },
        required: ['path'],
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const create: VaultToolDefinition = {
    title: 'Create an Obsidian note',
    description: [
        'Creates a new Markdown note in the owner\'s Obsidian vault, with missing folders. Fails if the note already exists.',
        'Returns "diff", the unified diff of the new file; show it to the user in a ```diff code block.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Vault-relative path of the new note; ".md" is added when missing.',
            },
            content: {
                type: 'string',
                description: 'The Markdown text of the note, without frontmatter.',
            },
            frontmatter: {
                type: 'object',
                description: 'Optional YAML frontmatter properties, e.g. {"aliases": ["Lisboa"]}.',
            },
        },
        required: ['path'],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
};

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

const patch: VaultToolDefinition = {
    title: 'Edit an Obsidian note',
    description: [
        'Makes targeted edits to an existing note in the owner\'s Obsidian vault. Read the note with obsidian-read first and pass its "hash" as "expectedHash";',
        'if the note changed since then, the edit is refused with a conflict and you must read it again.',
        'The operations run in order, and if one fails, nothing is written. Operation types:',
        '"append" adds "text" on a new line at the end of the note, or at the end of "section" (start "text" with an empty line to make a new paragraph);',
        '"replace" replaces the exact text "find", which must occur exactly once, with "replace";',
        '"replaceSection" replaces the body under the heading "section" with "content" and keeps the heading;',
        '"setFrontmatter" sets the given "properties", and a null value deletes a property.',
        'Returns "diff", the unified diff of the whole file including frontmatter; show it to the user in a ```diff code block.',
        'The result has no new hash: to edit the same note again, read it again first.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Vault-relative note path.',
            },
            expectedHash: {
                type: 'string',
                description: 'The "hash" from the latest obsidian-read of this note.',
            },
            operations: {
                type: 'array',
                minItems: 1,
                maxItems: PATCH_LIMITS.maxOperations,
                items: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: Object.keys(PATCH_OPERATION_FIELDS),
                        },
                        text: {
                            type: 'string',
                            description: 'append: the text to add.',
                        },
                        section: {
                            type: 'string',
                            description: 'append (optional) and replaceSection: the heading, or a heading path such as "Week 3 > Notes".',
                        },
                        find: {
                            type: 'string',
                            description: 'replace: the exact current text.',
                        },
                        replace: {
                            type: 'string',
                            description: 'replace: the new text.',
                        },
                        content: {
                            type: 'string',
                            description: 'replaceSection: the new section body.',
                        },
                        properties: {
                            type: 'object',
                            description: 'setFrontmatter: the properties to set; null deletes one.',
                        },
                    },
                    required: ['type'],
                    additionalProperties: false,
                },
            },
        },
        required: [
            'path',
            'expectedHash',
            'operations',
        ],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
    },
};

const move: VaultToolDefinition = {
    title: 'Rename or move an Obsidian note',
    description: [
        'Renames a note in the owner\'s Obsidian vault or moves it to another folder, with missing folders. Fails if a file already exists at the new path.',
        'Like Obsidian, it updates the links to the note in all other notes, and the relative links inside the moved note;',
        'a rewritten wikilink keeps its heading, block reference and display text.',
        'Returns "diffs", the unified diff of every note whose text changed; show them to the user in ```diff code blocks.',
        '"skippedLinks" lists links it did not change because they were ambiguous or matched only an alias before the move; tell the user about them.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Vault-relative path of the note to move, e.g. "Ideas.md".',
            },
            newPath: {
                type: 'string',
                description: 'The new vault-relative path, e.g. "archive/Old ideas.md"; ".md" is added when missing.',
            },
        },
        required: [
            'path',
            'newPath',
        ],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
    },
};

const diary_append: VaultToolDefinition = {
    title: 'Add a diary record',
    description: [
        'Appends the text the user has just written to the owner\'s diary draft as one new record; the server adds the timestamp.',
        'Returns "diff", the record as it was added.',
        'Use this to record a diary entry, not obsidian-patch. Fix only typos and grammar; never reword, summarise or translate.',
        'Follow the Diary section of the vault\'s AGENTS.md for the full rules.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            text: {
                type: 'string',
                description: 'The text of the record.',
            },
        },
        required: ['text'],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
};

/** In the order that `tools/list` shows them. */
export const VAULT_TOOL_DEFINITIONS = {
    list,
    search,
    read,
    links,
    create,
    patch,
    move,
    diary_append,
} as const satisfies Record<string, VaultToolDefinition>;

export type VaultToolName = keyof typeof VAULT_TOOL_DEFINITIONS;

export const VAULT_TOOL_NAMES = Object.keys(VAULT_TOOL_DEFINITIONS) as VaultToolName[];

export function isVaultToolName(name: unknown): name is VaultToolName {
    return typeof name === 'string' && Object.hasOwn(VAULT_TOOL_DEFINITIONS, name);
}

/** The argument keys a tool accepts: exactly the properties of its input schema. */
export function getVaultToolArgumentKeys(name: VaultToolName): string[] {
    return Object.keys(VAULT_TOOL_DEFINITIONS[name].inputSchema.properties);
}
