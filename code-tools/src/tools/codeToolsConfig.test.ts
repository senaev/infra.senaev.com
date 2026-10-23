import {
    describe, expect, it,
} from 'vitest';

import { createCommandEnv } from './codeToolsConfig';

describe('createCommandEnv', () => {
    it('removes the variables that make git use another repository, and the internal token', () => {
        const env = createCommandEnv({
            PATH: '/usr/bin',
            GIT_DIR: '/real/repo/.git/worktrees/x',
            GIT_WORK_TREE: '/real/repo',
            GIT_INDEX_FILE: '/real/repo/.git/index',
            GIT_COMMON_DIR: '/real/repo/.git',
            GIT_AUTHOR_NAME: 'Test',
            INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS: 'secret',
        });

        expect(env).toEqual({
            PATH: '/usr/bin',
            GIT_AUTHOR_NAME: 'Test',
            GIT_TERMINAL_PROMPT: '0',
            GIT_PAGER: 'cat',
            PAGER: 'cat',
        });
    });
});
