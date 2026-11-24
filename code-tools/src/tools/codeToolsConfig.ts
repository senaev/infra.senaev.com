export type CodeToolsConfig = {
    /** The environment of shell commands and of git. */
    commandEnv: NodeJS.ProcessEnv;
};

/**
 * `git rev-parse --local-env-vars`: they choose the repository instead of the working
 * folder. A git hook exports GIT_DIR, so a test run from a pre-push hook once committed its
 * fixtures into the real repository and made it bare.
 */
const GIT_REPOSITORY_ENV_NAMES = [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_OBJECT_DIRECTORY',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_GRAFT_FILE',
    'GIT_INDEX_FILE',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_REPLACE_REF_BASE',
    'GIT_PREFIX',
    'GIT_SHALLOW_FILE',
    'GIT_COMMON_DIR',
];

/**
 * Commands must never wait for input: stdin is closed, so git must not ask for a password
 * and no pager may start. Git works on the repository of its working folder only.
 */
export function createCommandEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const commandEnv: NodeJS.ProcessEnv = {
        ...env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
        PAGER: 'cat',
    };

    for (const name of GIT_REPOSITORY_ENV_NAMES) {
        delete commandEnv[name];
    }

    return commandEnv;
}

export function createCodeToolsConfig(env: NodeJS.ProcessEnv = process.env): CodeToolsConfig {
    return {
        commandEnv: createCommandEnv(env),
    };
}
