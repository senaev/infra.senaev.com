import {
    formatNumber,
    getToolArgumentKeys,
    pagingProperties,
    READ_ONLY_ANNOTATIONS,
    type ToolDefinition,
} from '../toolServer/toolDefinition';

import {
    CLONE_LIMITS,
    LIST_LIMITS,
    MAX_GLOB_LENGTH,
    PATCH_LIMITS,
    READ_LIMITS,
    RUN_LIMITS,
    SEARCH_LIMITS,
    WRITE_LIMITS,
} from './codeToolLimits';

// The code tools as ChatGPT sees them. code-tools runs in the opencode-serve container and
// serves each one as `POST /code/<name>`, accepting exactly the argument keys of its input
// schema; cluster-helper lists them over MCP as `code-<name>` and forwards the calls.

/** Every MCP tool name is this prefix followed by the code tool name. */
export const CODE_TOOL_PREFIX = 'code-';

/** A project is a folder with a git repository in the projects folder; its name is the folder name. */
export const PROJECT_NAME_PATTERN = '^[A-Za-z0-9_][A-Za-z0-9._-]*$';

const PROJECT_RULES = 'Before you change a project, read its AGENTS.md (or README.md) with code-read, if it is not in your context yet.';

const PROJECT_PROPERTY = {
    project: {
        type: 'string',
        pattern: PROJECT_NAME_PATTERN,
        description: 'The project name from code-projects.',
    },
};

const SCOPE_PROPERTIES = {
    folder: {
        type: 'string',
        description: 'Project-relative folder to limit the scope to, e.g. "src". Default: the whole project.',
    },
    glob: {
        type: 'string',
        maxLength: MAX_GLOB_LENGTH,
        description: 'File name pattern, e.g. "*.ts". A pattern with "/" is matched against the project-relative path, e.g. "src/**/*.test.ts".',
    },
};

const WRITES_FILES = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
};

const projects: ToolDefinition = {
    title: 'List code projects',
    description: [
        'Lists the code projects on the owner\'s server: one git repository per project, with its current branch,',
        'the number of changed files, the "origin" remote and whether it has an AGENTS.md.',
        'Start here to find the project name for the other code tools. To add a project, use code-clone.',
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
};

const clone: ToolDefinition = {
    title: 'Clone a git repository',
    description: [
        'Clones a git repository into a new project on the owner\'s server. Fails if a project with that name already exists.',
        'GitHub repositories work over SSH ("git@github.com:owner/repo.git") and over HTTPS.',
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                maxLength: CLONE_LIMITS.maxUrlLength,
                description: 'The repository URL, e.g. "git@github.com:senaev/infra.senaev.com.git".',
            },
            name: {
                type: 'string',
                pattern: PROJECT_NAME_PATTERN,
                description: 'The project name. Default: the repository name from the URL.',
            },
        },
        required: ['url'],
        additionalProperties: false,
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
    },
};

const list: ToolDefinition = {
    title: 'List project files',
    description: [
        'Lists the files and folders of a project. Files ignored by .gitignore and the .git folder are not shown.',
        'Without "recursive" or "glob" it lists one folder level; with them it lists matching files at any depth.',
        'The result is paged: when "nextOffset" is not null, call again with "offset" set to it.',
        PROJECT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...PROJECT_PROPERTY,
            ...SCOPE_PROPERTIES,
            recursive: {
                type: 'boolean',
                description: 'List files in all subfolders, not only one level.',
            },
            ...pagingProperties(LIST_LIMITS, { items: 'Entries' }),
        },
        required: ['project'],
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
};

const search: ToolDefinition = {
    title: 'Search project files',
    description: [
        'Searches the text of a project\'s files with ripgrep; files ignored by .gitignore are skipped.',
        'Each query is literal text unless "regex" is true. A file matches if it contains at least one query.',
        `Up to ${SEARCH_LIMITS.maxQueries} queries per call. Results are grouped by file, with line numbers and context;`,
        'read a file with code-read to see more.',
        'The result is paged: when "nextOffset" is not null, call again with "offset" set to it.',
        PROJECT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...PROJECT_PROPERTY,
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
            'project',
            'queries',
        ],
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
};

const read: ToolDefinition = {
    title: 'Read project files',
    description: [
        'Reads text files of a project. Each file comes with "hash", which code-patch and code-write need to change it.',
        `One response holds at most ${formatNumber(READ_LIMITS.maxCharsPerResponse)} characters and whole lines only; continue with "remainingPaths".`,
        `A file longer than ${formatNumber(READ_LIMITS.maxCharsPerFile)} characters is cut with "truncated": true;`,
        'read the rest with "startLine" set to "nextStartLine".',
        PROJECT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...PROJECT_PROPERTY,
            paths: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: READ_LIMITS.maxPaths,
                description: 'Project-relative file paths, e.g. "src/index.ts".',
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
        required: [
            'project',
            'paths',
        ],
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
};

const write: ToolDefinition = {
    title: 'Write a project file',
    description: [
        'Creates a file in a project, with missing folders, or replaces the whole text of an existing file.',
        'To replace an existing file, pass the "hash" from the latest code-read as "expectedHash";',
        'without "expectedHash" the call fails if the file exists. For small changes to a big file, use code-patch.',
        'Returns "diff", the unified diff of the file; show it to the user in a ```diff code block.',
        PROJECT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...PROJECT_PROPERTY,
            path: {
                type: 'string',
                description: 'Project-relative file path.',
            },
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
            'project',
            'path',
            'content',
        ],
        additionalProperties: false,
    },
    annotations: WRITES_FILES,
};

const patch: ToolDefinition = {
    title: 'Edit a project file',
    description: [
        'Makes targeted edits to an existing file of a project. Read the file with code-read first and pass its "hash" as "expectedHash";',
        'if the file changed since then, the edit is refused with a conflict and you must read it again.',
        'Each operation replaces the exact text "find", which must occur exactly once, with "replace"; include enough lines in "find" to make it unique.',
        'The operations run in order, and if one fails, nothing is written.',
        'Returns "diff", the unified diff of the file, and the new "hash", so you can edit the same file again without reading it.',
        'Show the diff to the user in a ```diff code block.',
        PROJECT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...PROJECT_PROPERTY,
            path: {
                type: 'string',
                description: 'Project-relative file path.',
            },
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
            'project',
            'path',
            'expectedHash',
            'operations',
        ],
        additionalProperties: false,
    },
    annotations: WRITES_FILES,
};

const run: ToolDefinition = {
    title: 'Run a shell command in a project',
    description: [
        'Runs a bash command in the project folder on the owner\'s server and returns the exit code, stdout and stderr.',
        'Use it for tests, builds, linters and git: status, diff, log, checkout, commit, push. "gh" is available for GitHub pull requests.',
        `The command is stopped after "timeoutSeconds" (default ${RUN_LIMITS.defaultTimeoutSeconds}, at most ${RUN_LIMITS.maxTimeoutSeconds});`,
        'for a potentially long command, set it higher.',
        `Only the last ${formatNumber(RUN_LIMITS.maxOutputChars)} characters of the output are returned, so limit long output yourself, e.g. with "| tail -n 100".`,
        'Ask the user before a command that publishes or deletes: git push, gh pr create, rm -r, git reset --hard.',
        PROJECT_RULES,
    ].join(' '),
    inputSchema: {
        type: 'object',
        properties: {
            ...PROJECT_PROPERTY,
            command: {
                type: 'string',
                minLength: 1,
                maxLength: RUN_LIMITS.maxCommandLength,
                description: 'The bash command, e.g. "npm test -- src/foo.test.ts".',
            },
            timeoutSeconds: {
                type: 'integer',
                minimum: 1,
                maximum: RUN_LIMITS.maxTimeoutSeconds,
                description: `Default: ${RUN_LIMITS.defaultTimeoutSeconds}.`,
            },
        },
        required: [
            'project',
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
    projects,
    clone,
    list,
    search,
    read,
    write,
    patch,
    run,
} as const satisfies Record<string, ToolDefinition>;

export type CodeToolName = keyof typeof CODE_TOOL_DEFINITIONS;

export const CODE_TOOL_NAMES = Object.keys(CODE_TOOL_DEFINITIONS) as CodeToolName[];

export function isCodeToolName(name: unknown): name is CodeToolName {
    return typeof name === 'string' && Object.hasOwn(CODE_TOOL_DEFINITIONS, name);
}

export function getCodeToolArgumentKeys(name: CodeToolName): string[] {
    return getToolArgumentKeys(CODE_TOOL_DEFINITIONS[name]);
}
