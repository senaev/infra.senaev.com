export type CodeToolsConfig = {
    /** The folder with one git repository per project. */
    projectsRoot: string;
    /** The environment of shell commands and of git; without the internal token. */
    commandEnv: NodeJS.ProcessEnv;
};

const SECRET_ENV_NAMES = ['INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS'];

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
 * and no pager may start. Git works on the project in its working folder only.
 */
export function createCommandEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const commandEnv: NodeJS.ProcessEnv = {
        ...env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
        PAGER: 'cat',
    };

    for (const name of [
        ...SECRET_ENV_NAMES,
        ...GIT_REPOSITORY_ENV_NAMES,
    ]) {
        delete commandEnv[name];
    }

    return commandEnv;
}

export function createCodeToolsConfig(projectsRoot: string, env: NodeJS.ProcessEnv = process.env): CodeToolsConfig {
    return {
        projectsRoot,
        commandEnv: createCommandEnv(env),
    };
}
