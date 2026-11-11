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
    READ_ONLY_ANNOTATIONS,
    type ToolDefinition,
} from '../toolServer/toolDefinition';

import type { CodeCommandName } from './codeCommands';
import {
    LIST_LIMITS,
    MAX_GLOB_LENGTH,
    PATCH_LIMITS,
    READ_LIMITS,
    RUN_LIMITS,
    SEARCH_LIMITS,
    WRITE_LIMITS,
} from './codeToolLimits';

// The code tools as ChatGPT sees them. code-tools runs in its own container and serves each
// one as `POST /code/<name>`, accepting exactly the argument keys of its input schema;
// cluster-helper lists them over MCP as `code-<name>` and forwards the calls.

/** Every MCP tool name is this prefix followed by the code tool name. */
export const CODE_TOOL_PREFIX = 'code-';
const MANAGED_TOOL_DESCRIPTION = createManagedToolDescription(CODE_TOOL_PREFIX);

export const SERVER_RULES = 'If the server rules from /AGENTS.md are not in your context, read /AGENTS.md first with code-read; it describes the folder layout.';

export const ABSOLUTE_PATH_PATTERN = '^/';

function absolutePathProperty(description: string) {
    return {
        type: 'string',
        pattern: ABSOLUTE_PATH_PATTERN,
        description,
    };
}

const SCOPE_PROPERTIES = {
    folder: absolutePathProperty('Absolute path of the folder to work in, e.g. "/code/projects/my-repo/src".'),
    glob: {
        type: 'string',
        maxLength: MAX_GLOB_LENGTH,
        description: 'File name pattern, e.g. "*.ts". A pattern with "/" is matched against the path relative to "folder", e.g. "src/**/*.test.ts".',
    },
};

const WRITES_FILES = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
};

const list: ToolDefinition = {
    title: 'List files',
    description: [
        'Lists the files and folders in a folder on the owner\'s server, with absolute paths.',
        'Hidden files are shown; .git folders, and in a git repository the files ignored by .gitignore, are not.',
        'Without "recursive" or "glob" it lists one folder level; with them it lists matching files at any depth.',
        PAGED_RESULT_DESCRIPTION,
        MANAGED_TOOL_DESCRIPTION,
        SERVER_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            ...SCOPE_PROPERTIES,
            recursive: {
                type: 'boolean',
                description: 'List files in all subfolders, not only one level.',
            },
            ...pagingProperties(LIST_LIMITS, { items: 'Entries' }),
        },
        required: ['folder'],
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
};

const search: ToolDefinition = {
    title: 'Search files',
    description: [
        'Searches the text of the files in a folder with ripgrep; in a git repository, files ignored by .gitignore are skipped.',
        'Each query is literal text unless "regex" is true. A file matches if it contains at least one query.',
        `Up to ${SEARCH_LIMITS.maxQueries} queries per call. Results are grouped by file, with line numbers and context;`,
        'read a file with code-read to see more.',
        PAGED_RESULT_DESCRIPTION,
        MANAGED_TOOL_DESCRIPTION,
        SERVER_RULES,
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
                description: 'Texts to find.',
            },
            regex: {
                type: 'boolean',
                description: 'Read the queries as Rust regular expressions (ripgrep syntax). Default: false.',
            },
            caseSensitive: {
                type: 'boolean',
                description: 'Default: false.',
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
            ...pagingProperties(SEARCH_LIMITS, { items: 'Files' }),
        },
        required: [
            'folder',
            'queries',
        ],
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
};

const read: ToolDefinition = {
    title: 'Read files',
    description: [
        MANAGED_TOOL_DESCRIPTION,
        'Reads text files on the owner\'s server by absolute path. Each file comes with "hash", which code-patch and code-write need to change it.',
        `One response holds at most ${formatNumber(READ_LIMITS.maxCharsPerResponse)} characters and whole lines only; continue with "remainingPaths".`,
        `A file longer than ${formatNumber(READ_LIMITS.maxCharsPerFile)} characters is cut with "truncated": true;`,
        'read the rest with "startLine" set to "nextStartLine". A line longer than a page is rejected; use code-run to inspect it.',
        SERVER_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            paths: {
                type: 'array',
                items: {
                    type: 'string',
                    pattern: ABSOLUTE_PATH_PATTERN,
                },
                minItems: 1,
                maxItems: READ_LIMITS.maxPaths,
                description: 'Absolute file paths, e.g. "/code/projects/my-repo/src/index.ts".',
            },
            startLine: {
                type: 'integer',
                minimum: 1,
                description: 'The first line to read, from 1. Only with exactly one path.',
            },
            lineCount: {
                type: 'integer',
                minimum: 1,
                description: 'How many lines to read. Only with exactly one path.',
            },
        },
        required: ['paths'],
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
};

const write: ToolDefinition = {
    title: 'Write a file',
    description: [
        MANAGED_TOOL_DESCRIPTION,
        'Creates a file, with missing folders, or replaces the whole text of an existing file.',
        'To replace an existing file, pass the "hash" from the latest code-read as "expectedHash";',
        'without "expectedHash" the call fails if the file exists. For small changes to a big file, use code-patch.',
        'Returns "diff", the unified diff of the file.',
        DIFF_PRESENTATION_DESCRIPTION,
        MUTATION_CANCELLATION_DESCRIPTION,
        'Parallel mutations can conflict; hash checks and per-file atomic publication remain enforced.',
        SERVER_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: absolutePathProperty('Absolute file path.'),
            content: {
                type: 'string',
                maxLength: WRITE_LIMITS.maxContentChars,
                description: 'The full new text of the file.',
            },
            expectedHash: {
                type: 'string',
                description: 'The "hash" from the latest code-read of the file. Only to replace an existing file.',
            },
        },
        required: [
            'path',
            'content',
        ],
        additionalProperties: false,
    },
    annotations: WRITES_FILES,
};

const patch: ToolDefinition = {
    title: 'Edit a file',
    description: [
        MANAGED_TOOL_DESCRIPTION,
        'Makes targeted edits to an existing file. Read the file with code-read first and pass its "hash" as "expectedHash";',
        'if the file changed since then, the edit is refused with a conflict and you must read it again.',
        'Each operation replaces the exact text "find", which must occur exactly once, with "replace"; include enough lines in "find" to make it unique.',
        'The operations run in order, and if one fails, nothing is written.',
        'Returns "diff", the unified diff of the file, and the new "hash", so you can edit the same file again without reading it.',
        DIFF_PRESENTATION_DESCRIPTION,
        MUTATION_CANCELLATION_DESCRIPTION,
        'Parallel mutations can conflict; hash checks and per-file atomic publication remain enforced.',
        SERVER_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...MANAGED_TOOL_PROPERTIES,
            path: absolutePathProperty('Absolute file path.'),
            expectedHash: {
                type: 'string',
                description: 'The "hash" from the latest code-read or code-patch of this file.',
            },
            operations: {
                type: 'array',
                minItems: 1,
                maxItems: PATCH_LIMITS.maxOperations,
                items: {
                    type: 'object',
                    properties: {
                        find: {
                            type: 'string',
                            minLength: 1,
                            description: 'The exact current text.',
                        },
                        replace: {
                            type: 'string',
                            description: 'The new text.',
                        },
                    },
                    required: [
                        'find',
                        'replace',
                    ],
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
    annotations: WRITES_FILES,
};

const run: ToolDefinition = {
    title: 'Run a shell command',
    description: [
        'Runs a bash command in the folder "cwd" on the owner\'s server and returns the exit code, stdout and stderr.',
        'Use it for tests, builds, linters and git: clone, status, diff, log, checkout, commit, push. "gh" is available for GitHub pull requests.',
        MANAGED_TOOL_DESCRIPTION,
        'A nonzero command exit code is retained as a normal command result with operation.state=failed; inspect exitCode before running dependent commands.',
        `Only the last ${formatNumber(RUN_LIMITS.maxOutputChars)} characters of the output are returned, so limit long output yourself, e.g. with "| tail -n 100".`,
        SERVER_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            cwd: absolutePathProperty('Absolute path of the folder to run the command in, e.g. "/code/projects/my-repo".'),
            command: {
                type: 'string',
                minLength: 1,
                maxLength: RUN_LIMITS.maxCommandLength,
                description: 'The bash command, e.g. "npm test -- src/foo.test.ts".',
            },
            ...MANAGED_TOOL_PROPERTIES,
        },
        required: [
            'cwd',
            'command',
        ],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
    },
};

/** In the order that `tools/list` shows them. */
export const CODE_TOOL_DEFINITIONS = {
    list,
    search,
    read,
    write,
    patch,
    run,
} as const satisfies Record<CodeCommandName, ToolDefinition>;

export type CodeToolName = CodeCommandName;

export const CODE_TOOL_NAMES = Object.keys(CODE_TOOL_DEFINITIONS) as CodeToolName[];

export function isCodeToolName(name: unknown): name is CodeToolName {
    return typeof name === 'string' && Object.hasOwn(CODE_TOOL_DEFINITIONS, name);
}

export function getCodeToolArgumentKeys(name: CodeToolName): string[] {
    return getToolArgumentKeys(CODE_TOOL_DEFINITIONS[name]);
}

/** Control tools are separate from domain handlers and always bypass the FIFO queue. */
export const CODE_MCP_TOOL_DEFINITIONS = {
    ...CODE_TOOL_DEFINITIONS,
    ...OPERATION_TOOL_DEFINITIONS,
};
