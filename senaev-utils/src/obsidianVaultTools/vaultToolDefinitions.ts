import {
    DIFF_PRESENTATION_DESCRIPTION, MUTATION_CANCELLATION_DESCRIPTION, PAGED_RESULT_DESCRIPTION,
} from '../toolServer/toolDescriptions';
import {
    createManagedToolDescription, MANAGED_TOOL_PROPERTIES, OPERATION_TOOL_DEFINITIONS,
} from '../operations/operationToolDefinitions';
import {
    formatNumber,
    getToolArgumentKeys,
    pagingProperties,
    READ_ONLY_ANNOTATIONS as READ_ONLY,
    type ToolDefinition,
} from '../toolServer/toolDefinition';
import { TASK_PRIORITIES, TASK_STATUSES } from '../obsidianTasks/taskLine';

import { PATCH_OPERATION_FIELDS, type VaultCommandName } from './vaultCommands';
import {
    DEFAULT_TASKS_NOTE_PATH,
    LINKS_LIMITS,
    LIST_LIMITS,
    MAX_GLOB_LENGTH,
    PATCH_LIMITS,
    READ_LIMITS,
    SEARCH_LIMITS,
    TASK_WRITE_LIMITS,
    TASKS_LIST_LIMITS,
    TASKS_TIME_ZONE,
} from './vaultToolLimits';

export { PATCH_OPERATION_FIELDS, type PatchOperationType } from './vaultCommands';

// The Obsidian vault tools as ChatGPT sees them. obsidian-sync serves each one as
// `POST /vault/<name>` and accepts exactly the argument keys of its input schema;
// cluster-helper lists them over MCP as `obsidian-<name>` and forwards the calls.

/** Every MCP tool name is this prefix followed by the vault tool name. */
export const OBSIDIAN_TOOL_PREFIX = 'obsidian-';

// The rules themselves live only in the vault's AGENTS.md. MCP `instructions` were tried and
// dropped: ChatGPT read AGENTS.md through this sentence anyway (see
// tasks/2026-10-10-obsidian-mcp-vault-rules-and-diary-tool.md in infra.senaev.com).
const VAULT_RULES = `${createManagedToolDescription(OBSIDIAN_TOOL_PREFIX)} ${MUTATION_CANCELLATION_DESCRIPTION} Move can leave the new note and only some rewritten backlinks when cancelled. If the vault rules from the root AGENTS.md are not in your context, read AGENTS.md with obsidian-read first.`;

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

const list: ToolDefinition = {
    title: 'List Obsidian notes',
    description: [
        'Lists notes and folders; includeAttachments also lists attachments with size and hash.',
        'Without filters it lists one folder level. With "recursive", "glob" or a diary range it lists matching notes at any depth.',
        'Use a diary range to find the diary entries of a period before you read them.',
        PAGED_RESULT_DESCRIPTION,
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            ...SCOPE_PROPERTIES,
            includeAttachments: {
                type: 'boolean',
                description: 'Include non-Markdown files and SHA-256 hashes for files up to 25 MiB. Default: false. Larger files have hashUnavailable.',
            },
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

const search: ToolDefinition = {
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
            ...MANAGED_TOOL_PROPERTIES,
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

const read: ToolDefinition = {
    title: 'Read Obsidian notes',
    description: [
        'Reads notes from the owner\'s Obsidian vault: the full text, the parsed frontmatter, and a "hash" that obsidian-patch needs to edit the note.',
        `Give either "paths" or a diary range. One response holds at most ${formatNumber(READ_LIMITS.maxCharsPerResponse)} characters and whole notes only:`,
        'continue with "remainingPaths" (paths read) or with "diaryFrom" set to "nextDiaryFrom" (diary range read).',
        `A note longer than ${formatNumber(READ_LIMITS.maxCharsPerNote)} characters is cut with "truncated": true; read the rest with "startChar" set to "nextStartChar", or read one section.`,
        'Everything you read stays in the conversation, so to summarise a long diary range, read and summarise it in parts (e.g. one month at a time) and then combine the summaries.',
        'Explicit paths also read supported UTF-8 text files up to 5 MiB; binaries return metadata and hash only (up to 25 MiB). Sections and frontmatter apply only to Markdown.',
        'Cite the source notes by their path or date.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
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
            lineNumbers: {
                type: 'boolean',
                description: 'Start each line of "content" with its line number in the file, e.g. "12: text"; frontmatter lines count too. Use it to find "afterLine" for obsidian-tasks_create. Default: false.',
            },
        },
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const links: ToolDefinition = {
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
            ...MANAGED_TOOL_PROPERTIES,
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

const create: ToolDefinition = {
    title: 'Create an Obsidian note',
    description: [
        'Creates a new Markdown note in the owner\'s Obsidian vault, with missing folders. Fails if the note already exists.',
        'Returns "diff", the unified diff of the new file.',
        DIFF_PRESENTATION_DESCRIPTION,
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
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

const patch: ToolDefinition = {
    title: 'Edit an Obsidian note',
    description: [
        'Makes targeted edits to an existing note in the owner\'s Obsidian vault. Read the note with obsidian-read first and pass its "hash" as "expectedHash";',
        'if the note changed since then, the edit is refused with a conflict and you must read it again.',
        'Supports UTF-8 text files up to 5 MiB, including CSV; binary editing is rejected. For non-Markdown, only replace and append without section are allowed; append is exact concatenation without added newlines.',
        'The operations run in order, and if one fails, nothing is written. Operation types:',
        '"append" adds "text" on a new line at the end of the note, or at the end of "section" (start "text" with an empty line to make a new paragraph);',
        '"replace" replaces the exact text "find", which must occur exactly once, with "replace";',
        '"replaceSection" replaces the body under the heading "section" with "content" and keeps the heading;',
        '"setFrontmatter" sets the given "properties", and a null value deletes a property.',
        'Returns "diff", the unified diff of the whole file including frontmatter.',
        DIFF_PRESENTATION_DESCRIPTION,
        'The result has no new hash: to edit the same note again, read it again first.',
        'To add or change a task (a "- [ ]" line), use obsidian-tasks_create or obsidian-tasks_update instead.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
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

const move: ToolDefinition = {
    title: 'Rename or move an Obsidian note',
    description: [
        'Renames a note in the owner\'s Obsidian vault or moves it to another folder, with missing folders. Fails if a file already exists at the new path.',
        'Like Obsidian, it updates the links to the note in all other notes, and the relative links inside the moved note;',
        'a rewritten wikilink keeps its heading, block reference and display text.',
        'Also moves attachments up to 25 MiB byte-for-byte and updates their Markdown backlinks/embeds. Attachment destinations require an exact filename; no .md suffix is added.',
        'Returns "diffs", the unified diff of every note whose text changed.',
        DIFF_PRESENTATION_DESCRIPTION,
        '"skippedLinks" lists links it did not change because they were ambiguous or matched only an alias before the move; tell the user about them.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
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

const diary_append: ToolDefinition = {
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
            ...MANAGED_TOOL_PROPERTIES,
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

const ISO_DAY_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

const TASK_FORMAT_DESCRIPTION = [
    'Tasks are "- [ ]" lines in the emoji format of the Obsidian Tasks plugin.',
    'A task has: "status" (open, done, cancelled); "description"; "source", who created it, written as "🌱 <source>" (null when absent);',
    '"priority" (highest 🔺, high ⏫, medium 🔼, normal (no emoji), low 🔽, lowest ⏬); "dueDate" 📅;',
    '"closedDate", ✅ for done or ❌ for cancelled; "recurrence" 🔁 in the Tasks wording, e.g. "every week", "every 3 months", "every 90 days when done".',
    `Dates are YYYY-MM-DD; "today" is the owner's day in ${TASKS_TIME_ZONE}.`,
].join(' ');

const PRIORITY_PROPERTY = {
    type: 'string',
    enum: [...TASK_PRIORITIES],
};

const NULLABLE_DAY = {
    type: [
        'string',
        'null',
    ],
    pattern: ISO_DAY_PATTERN,
};

const TASK_WRITE_ANNOTATIONS = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};

const TASK_WRITE_RESULT_DESCRIPTION = [
    'Returns "task" (the written task with its new "line", "raw" and "hash"), "nextOccurrence" (the new task of a completed recurring task, or null),',
    'the new file "hash" for the next task write in the same note, and "diff".',
    DIFF_PRESENTATION_DESCRIPTION,
].join(' ');

const tasks_list: ToolDefinition = {
    title: 'List Obsidian tasks',
    description: [
        'Lists the tasks of the owner\'s Obsidian vault with their note "path", "line", the file "hash" and the line as written ("raw").',
        TASK_FORMAT_DESCRIPTION,
        'All filters are optional and combine with AND. Without filters it lists every task, also closed ones.',
        '"dailyNote" gives exactly the task list of that daily note in Obsidian: the tasks closed on that day, and on the active note (today, or the latest daily note) also the open tasks due on or before it and the undated open tasks of normal or higher priority.',
        'Tasks are sorted by priority, then note path, then line. Tasks in periodic/ notes are part of the list but never of a daily note list.',
        'Lines that look like tasks but cannot be read (e.g. an invalid date) are not listed; they are counted in "parseErrors".',
        PAGED_RESULT_DESCRIPTION,
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            dailyNote: {
                type: 'string',
                description: `"today" or a day YYYY-MM-DD: list the tasks that the daily note of that day shows. "today" is the owner's day in ${TASKS_TIME_ZONE}; the result tells the day in "dailyNote".`,
            },
            status: {
                type: 'array',
                items: {
                    type: 'string',
                    enum: [...TASK_STATUSES],
                },
                minItems: 1,
                description: 'Only tasks with one of these statuses.',
            },
            priority: {
                type: 'array',
                items: PRIORITY_PROPERTY,
                minItems: 1,
                description: 'Only tasks with one of these priorities.',
            },
            queries: {
                type: 'array',
                items: {
                    type: 'string',
                    minLength: 1,
                    maxLength: SEARCH_LIMITS.maxQueryLength,
                },
                minItems: 1,
                maxItems: SEARCH_LIMITS.maxQueries,
                description: 'Literal texts to find in the task description, case-insensitive, as in obsidian-search. Send several languages and word forms.',
            },
            match: {
                type: 'string',
                enum: [
                    'any',
                    'all',
                ],
                description: '"any" (default): the description contains at least one query. "all": it contains every query.',
            },
            wholeWord: {
                type: 'boolean',
                description: 'Match whole words only. Default: false.',
            },
            dueFrom: {
                type: 'string',
                pattern: ISO_DAY_PATTERN,
                description: 'Only tasks due on or after this day; tasks without a due date are left out.',
            },
            dueTo: {
                type: 'string',
                pattern: ISO_DAY_PATTERN,
                description: 'Only tasks due on or before this day; tasks without a due date are left out.',
            },
            closedFrom: {
                type: 'string',
                pattern: ISO_DAY_PATTERN,
                description: 'Only tasks done or cancelled on or after this day.',
            },
            closedTo: {
                type: 'string',
                pattern: ISO_DAY_PATTERN,
                description: 'Only tasks done or cancelled on or before this day.',
            },
            folder: SCOPE_PROPERTIES.folder,
            glob: SCOPE_PROPERTIES.glob,
            ...pagingProperties(TASKS_LIST_LIMITS, { items: 'Tasks' }),
        },
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const tasks_create: ToolDefinition = {
    title: 'Add an Obsidian task',
    description: [
        'Adds one open task to an existing note of the owner\'s Obsidian vault; the server writes the task line.',
        TASK_FORMAT_DESCRIPTION,
        `When the user names no note, follow the vault rule: path "${DEFAULT_TASKS_NOTE_PATH}", "afterLine": 0 and "blankLinesAfter": 1, so the task is the first line, separated by a blank line.`,
        'For another note, read it with obsidian-read and "lineNumbers": true, and choose the line to insert after. The task cannot go inside frontmatter, a code block, an HTML block or a table.',
        'Pass the note "hash" (from obsidian-read, obsidian-tasks_list or the previous task write) as "expectedHash"; if the note changed, the call fails with a conflict and you must read it again.',
        'Set "dueDate" only when the user gives a date or deadline. A recurring task needs "dueDate".',
        TASK_WRITE_RESULT_DESCRIPTION,
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: {
                type: 'string',
                description: `Vault-relative path of an existing note, e.g. "${DEFAULT_TASKS_NOTE_PATH}".`,
            },
            expectedHash: {
                type: 'string',
                description: 'The latest "hash" of this note.',
            },
            afterLine: {
                type: 'integer',
                minimum: 0,
                description: 'Insert the task after this line number of the file; 0 puts it at the top.',
            },
            blankLinesBefore: {
                type: 'integer',
                minimum: 0,
                maximum: TASK_WRITE_LIMITS.maxBlankLines,
                description: 'Empty lines to add before the task; none at the top of the file. Default: 0.',
            },
            blankLinesAfter: {
                type: 'integer',
                minimum: 0,
                maximum: TASK_WRITE_LIMITS.maxBlankLines,
                description: 'Empty lines to add after the task; none at the end of the file. Default: 0.',
            },
            description: {
                type: 'string',
                minLength: 1,
                maxLength: TASK_WRITE_LIMITS.maxDescriptionLength,
                description: 'The task text, in the user\'s words. Wikilinks are fine.',
            },
            source: {
                type: 'string',
                maxLength: TASK_WRITE_LIMITS.maxSourceLength,
                description: 'Who created the task. Default: "Agent".',
            },
            priority: {
                ...PRIORITY_PROPERTY,
                description: 'Default: "normal".',
            },
            dueDate: {
                type: 'string',
                pattern: ISO_DAY_PATTERN,
                description: 'The due date, YYYY-MM-DD.',
            },
            recurrence: {
                type: 'string',
                maxLength: TASK_WRITE_LIMITS.maxRecurrenceLength,
                description: 'E.g. "every month" or "every 2 weeks when done".',
            },
        },
        required: [
            'path',
            'expectedHash',
            'afterLine',
            'description',
        ],
        additionalProperties: false,
    },
    annotations: TASK_WRITE_ANNOTATIONS,
};

const tasks_update: ToolDefinition = {
    title: 'Change an Obsidian task',
    description: [
        'Changes one task of the owner\'s Obsidian vault, found by "path" and "line" from obsidian-tasks_list or a previous task write.',
        TASK_FORMAT_DESCRIPTION,
        '"changes" is partial: a given field replaces the value, null clears it, and an omitted field stays.',
        'Done or cancelled without "closedDate" sets it to today; back to open clears it.',
        'Completing a recurring task (it needs "dueDate") adds its next occurrence on the line below, like the Tasks plugin: the next due date counts from the due date, or from the completion day with "when done".',
        'Only a top-level "- [ ]" task written exactly in this tool\'s format can be changed; otherwise the call fails and returns the line as written ("actual") and as this tool would write it ("expected"). Tell the user, do not edit it with obsidian-patch.',
        'Pass the note "hash" as "expectedHash"; if the note changed, the call fails with a conflict: list or read again to get the new line and hash.',
        'There is no delete: mark a task done or cancelled instead.',
        TASK_WRITE_RESULT_DESCRIPTION,
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: {
                type: 'string',
                description: 'Vault-relative note path.',
            },
            line: {
                type: 'integer',
                minimum: 1,
                description: 'The line number of the task in the file.',
            },
            expectedHash: {
                type: 'string',
                description: 'The latest "hash" of this note.',
            },
            changes: {
                type: 'object',
                minProperties: 1,
                properties: {
                    status: {
                        type: 'string',
                        enum: [...TASK_STATUSES],
                    },
                    description: {
                        type: 'string',
                        minLength: 1,
                        maxLength: TASK_WRITE_LIMITS.maxDescriptionLength,
                    },
                    source: {
                        type: [
                            'string',
                            'null',
                        ],
                        maxLength: TASK_WRITE_LIMITS.maxSourceLength,
                    },
                    priority: PRIORITY_PROPERTY,
                    dueDate: NULLABLE_DAY,
                    closedDate: NULLABLE_DAY,
                    recurrence: {
                        type: [
                            'string',
                            'null',
                        ],
                        maxLength: TASK_WRITE_LIMITS.maxRecurrenceLength,
                    },
                },
                additionalProperties: false,
            },
        },
        required: [
            'path',
            'line',
            'expectedHash',
            'changes',
        ],
        additionalProperties: false,
    },
    annotations: {
        ...TASK_WRITE_ANNOTATIONS,
        destructiveHint: true,
    },
};

const download: ToolDefinition = {
    title: 'Download an Obsidian file',
    description: [
        'Returns metadata only for one vault file up to 25 MiB: path, name, MIME type, size, SHA-256 hash, chunkSize in original bytes and chunkCount. Retrieve bytes with download_chunk using path, expectedHash and zero-based chunkIndex. Empty files have one empty chunk. Reconstruct the bytes in an execution environment and verify the whole SHA-256 before analysis; this is not automatic ChatGPT attachment import. A legacy authenticated MCP resource link is also returned for compatible clients. No public URL is created.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: {
                type: 'string',
                description: 'Exact vault-relative file path including extension.',
            },
        },
        required: ['path'],
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const download_chunk: ToolDefinition = {
    title: 'Download a chunk of an Obsidian file',
    description: [
        'Returns up to 12 KiB of original file bytes encoded as base64 in data, with path, size, hash, chunkSize, chunkCount, chunkIndex, offset, byteCount, encoding and isLast. First call download for metadata; pass its hash as expectedHash and request indexes 0 through chunkCount minus one. Every request revalidates and hashes the entire file up to 25 MiB; a changed hash returns conflict and requires restarting. Decode each chunk separately, concatenate by index, verify size and whole-file SHA-256 before opening. Bytes may be retained in authenticated in-memory operation results like other tool results; do not copy base64 into user-facing prose. Requires client execution tools to reconstruct files and does not promise a native ChatGPT attachment.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: {
                type: 'string',
                description: 'Exact vault-relative file path from download metadata.',
            },
            expectedHash: {
                type: 'string',
                pattern: '^[a-f0-9]{64}$',
                description: 'Whole-file SHA-256 hash from download metadata.',
            },
            chunkIndex: {
                type: 'integer',
                minimum: 0,
                description: 'Zero-based index; must be less than chunkCount.',
            },
        },
        required: [
            'path',
            'expectedHash',
            'chunkIndex',
        ],
        additionalProperties: false,
    },
    annotations: READ_ONLY,
};

const upload: ToolDefinition = {
    title: 'Upload a file to Obsidian',
    description: [
        'Saves a user-provided file to an exact vault-relative path, creating parent folders. Accepts ChatGPT file references, not local filesystem paths or base64.',
        'Downloads the original bytes from the temporary download_url. Maximum 25 MiB and 60 seconds for download; expired URLs require a fresh file reference.',
        'Refuses existing destinations. Returns path, size and SHA-256 hash. No file contents or signed URLs are returned.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: {
                type: 'string',
                description: 'Exact destination including extension, e.g. @senaev/finances/transactions/2026-10.csv.',
            },
            file: {
                type: 'object',
                properties: {
                    download_url: { type: 'string' },
                    file_id: { type: 'string' },
                    mime_type: { type: 'string' },
                    file_name: { type: 'string' },
                },
                required: [
                    'download_url',
                    'file_id',
                ],
                additionalProperties: false,
            },
        },
        required: [
            'path',
            'file',
        ],
        additionalProperties: false,
    },
    _meta: { 'openai/fileParams': ['file'] },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
};

const deleteFile: ToolDefinition = {
    title: 'Move an Obsidian file to trash',
    description: [
        'Moves one note or attachment to recoverable .trash/mcp storage. Never permanently deletes it.',
        'Read or list the file first and pass its hash as expectedHash. Directories are not accepted.',
        'Returns trashPath and affected backlinks; note contents are not rewritten. Restore through the vault filesystem.',
        'Cancellation can leave a trash copy alongside the original; inspect changedPaths before retrying.',
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: {
                type: 'string',
                description: 'Exact vault-relative file path.',
            },
            expectedHash: {
                type: 'string',
                description: 'Latest SHA-256 hash from obsidian-read or obsidian-list with includeAttachments.',
            },
        },
        required: [
            'path',
            'expectedHash',
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

const csv_query: ToolDefinition = {
    title: 'Read and edit vault CSV files with SQL',
    description: [
        'Runs one SQLite statement against temporary tables built from selected CSV files. SELECT returns rows; INSERT/UPDATE/DELETE atomically save the affected CSV; CREATE TABLE initializes a new or zero-byte CSV with header names; ALTER TABLE ADD COLUMN and DROP COLUMN persist column changes. SQL determines the operation; there is no editing flag or separate edit command.',
        'tables is an array of {name, paths, expectedHash?}; files in a table must have identical ordered headers. All source cells are TEXT, including empty strings; no type inference or money/date conversion. Use explicit SQL CAST; SQLite casts are permissive and integer division truncates.',
        'CSV is strict UTF-8, comma-delimited with a header, optional BOM and standard double-quote escaping. Duplicate/empty headers are rejected. Read-only tables add TEXT columns _source_path and _source_record (1-based data record); the mutated table exposes CSV columns only. Those names and rowid aliases are reserved.',
        'Results contain columns and positional rows; integers outside the JavaScript safe range are decimal strings, BLOBs are rejected. Every result includes hashes [{path,hash}] and sources with byte hashes/record counts; single-file responses also include hash. Edits return the saved hash, affectedRows, changed and diff; edits matching no rows preserve the previous bytes/hash. Errors include hashes when readable; unknown/unavailable hashes are null. Files are individual snapshots, not a simultaneous multi-file transaction.',
        'Limits: 8 files, 4 MiB total CSV, 50000 data records, 100 columns per file, 64 KiB decoded cell contents per record, 16000 SQL characters, 100 bound positional parameters (64 KiB serialized total), 1000 output rows and 256 KiB serialized query result. maxRows defaults to 200. Truncation is explicit; input is never silently truncated.',
        'Query subprocess: 5 second deadline, one active query, SQLite 64 MiB allocation cap and V8 64 MiB old-space cap. Only approved tables and built-in analytical functions are allowed; PRAGMA, ATTACH, schema changes, triggers, extensions and arbitrary file/network access are unavailable except plain CREATE TABLE for a mapped uninitialized file and ADD/DROP COLUMN on a mapped single-file table. Renaming columns/tables and dropping tables remain unsupported. params accepts strings or null; cast parameters explicitly when needed.',
        'To edit, map the writable table to exactly one path and provide its latest expectedHash. Use expectedHash:null only to create a missing file through CREATE TABLE. Reads may combine files; a statement may mutate only one physical CSV. SQL values are TEXT; ADD COLUMN accepts a name with optional TEXT and fills existing rows with empty strings. DROP COLUMN removes its header and cells; at least one column must remain. Schema changes return affectedRows:0 with the saved hash and diff. Constraints, defaults, other types, RETURNING and multi-statement SQL are unsupported. Deleting all rows keeps the header. SQL errors/timeouts/cancellation before publication leave the CSV unchanged. Publication serializes in-process edits and rechecks the source hash; external writers are not transactionally locked.',
        'Optional <csv-path>.params.json persists sorting: {"sort":[{"expression":"occurred_datetime","direction":"DESC"}]}. Expressions use SQLite syntax and approved functions on the edited table only; direction is ASC/DESC. Keys apply in array order with stable ties, computed keys are not CSV columns. No sidecar or an empty sort array preserves row order. Sorting runs on matched edits and schema changes, not SELECT, unmatched edits or merely changing the sidecar. Invalid settings or changed sidecar hashes reject publication. Limits: 16 KiB JSON, 16 sort keys, 1000 characters per expression; SQL comments, parameters and statement separators are unsupported.',
        DIFF_PRESENTATION_DESCRIPTION,
        VAULT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            tables: {
                type: 'array',
                minItems: 1,
                maxItems: 8,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'name',
                        'paths',
                    ],
                    properties: {
                        expectedHash: {
                            type: [
                                'string',
                                'null',
                            ],
                            description: 'Latest SHA-256 for a single-path writable table; null creates a missing CSV. Omit for reads. Also acts as a version precondition for reads when supplied.',
                        },
                        name: {
                            type: 'string',
                            pattern: '^[A-Za-z][A-Za-z0-9_]{0,47}$',
                        },
                        paths: {
                            type: 'array',
                            minItems: 1,
                            maxItems: 8,
                            items: { type: 'string' },
                        },
                    },
                },
            },
            sql: {
                type: 'string',
                minLength: 1,
                maxLength: 16000,
            },
            params: {
                type: 'array',
                maxItems: 100,
                items: {
                    type: [
                        'string',
                        'null',
                    ],
                },
            },
            maxRows: {
                type: 'integer',
                minimum: 1,
                maximum: 1000,
            },
        },
        required: [
            'tables',
            'sql',
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

/** In the order that `tools/list` shows them. */
export const VAULT_TOOL_DEFINITIONS = {
    csv_query,
    download,
    download_chunk,
    upload,
    delete: deleteFile,
    list,
    search,
    read,
    links,
    create,
    patch,
    move,
    diary_append,
    tasks_list,
    tasks_create,
    tasks_update,
} as const satisfies Record<VaultCommandName, ToolDefinition>;

export type VaultToolName = VaultCommandName;

export const VAULT_TOOL_NAMES = Object.keys(VAULT_TOOL_DEFINITIONS) as VaultToolName[];

export function isVaultToolName(name: unknown): name is VaultToolName {
    return typeof name === 'string' && Object.hasOwn(VAULT_TOOL_DEFINITIONS, name);
}

/** The argument keys a tool accepts: exactly the properties of its input schema. */
export function getVaultToolArgumentKeys(name: VaultToolName): string[] {
    return getToolArgumentKeys(VAULT_TOOL_DEFINITIONS[name]);
}

export const VAULT_MCP_TOOL_DEFINITIONS = {
    ...VAULT_TOOL_DEFINITIONS,
    ...OPERATION_TOOL_DEFINITIONS,
};
