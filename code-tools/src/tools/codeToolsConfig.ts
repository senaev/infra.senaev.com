export type CodeToolsConfig = {
    /** The folder with one git repository per project. */
    projectsRoot: string;
    /** The environment of `code-run` commands and of git; without the internal token. */
    commandEnv: NodeJS.ProcessEnv;
};

const SECRET_ENV_NAMES = ['INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS'];

/**
 * Commands must never wait for input: stdin is closed, so git must not ask for a password
 * and no pager may start.
 */
export function createCommandEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const commandEnv: NodeJS.ProcessEnv = {
        ...env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
        PAGER: 'cat',
    };

    for (const name of SECRET_ENV_NAMES) {
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
