import {
    chmod, mkdir, writeFile,
} from 'node:fs/promises';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestRepositories, type TestRepositories } from './createTestRepositories';
import { listTool } from './listTool';

let repos: TestRepositories;

beforeEach(async () => {
    repos = await createTestRepositories({ demo: { 'README.md': '# Demo\n' } });
});
afterEach(async () => {
    await repos.remove();
});

/** Puts a fake `rg` with this bash body first on the PATH of the tools. */
async function fakeRipgrep(body: string) {
    const bin = repos.path('bin');

    await mkdir(bin, { recursive: true });
    await writeFile(repos.path('bin', 'rg'), `#!/bin/bash\n${body}\n`);
    await chmod(repos.path('bin', 'rg'), 0o755);
    repos.config.commandEnv.PATH = `${bin}:${process.env.PATH ?? ''}`;
}

function listRecursively() {
    return listTool(repos.config, {
        folder: repos.path('demo'),
        recursive: true,
    });
}

describe('listFiles with a failing ripgrep', () => {
    it('fails when ripgrep exits with an error and lists nothing', async () => {
        await fakeRipgrep('echo "rg: broken" >&2\nexit 2');

        await expect(listRecursively()).rejects.toMatchObject({
            code: 'command_failed',
            message: expect.stringContaining('rg: broken'),
        });
    });

    it('returns the partial files with the ripgrep errors as warnings', async () => {
        await fakeRipgrep('printf "b.txt\\0a.txt\\0"\necho "rg: ./secret: Permission denied" >&2\nexit 2');

        const result = await listRecursively();

        expect(result.entries.map((entry) => entry.path)).toEqual([
            repos.path('demo', 'a.txt'),
            repos.path('demo', 'b.txt'),
        ]);
        expect(result.warnings).toBe('rg: ./secret: Permission denied');
    });

    it('fails when ripgrep is stopped by a signal', async () => {
        await fakeRipgrep('printf "a.txt\\0"\nkill -KILL $$');

        await expect(listRecursively()).rejects.toMatchObject({
            code: 'command_failed',
            message: expect.stringContaining('SIGKILL'),
        });
    });

    it('fails when the output of ripgrep is truncated', async () => {
        await fakeRipgrep('head -c 20000100 /dev/zero');

        await expect(listRecursively()).rejects.toMatchObject({
            code: 'command_failed',
            message: expect.stringContaining('too many files'),
        });
    });
});
