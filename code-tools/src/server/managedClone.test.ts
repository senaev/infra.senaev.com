import {
    chmod, mkdir, readFile, readdir, writeFile,
} from 'node:fs/promises';

import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestProjects, type TestProjects } from '../tools/createTestProjects';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

type Reply = {
    code?: string;
    operation: { id: string; state: string; changedPaths: string[] };
    logs?: { text: string }[];
};

describe('managed clone publication and cleanup', () => {
    let projects: TestProjects;
    let server: CodeToolsServer;

    beforeEach(async () => {
        projects = await createTestProjects({ demo: { 'README.md': 'hello' } });
        server = createCodeToolsServer('clone-test', projects.config);
        const bin = projects.path('demo', '.bin');

        await mkdir(bin);
        projects.config.commandEnv.PATH = `${bin}:${process.env.PATH ?? ''}`;
    });
    afterEach(async () => {
        await server.close();
        await projects.remove();
    });
    function call(tool: string, payload: Record<string, unknown>) {
        return server.inject({
            method: 'POST',
            url: `/code/${tool}`,
            headers: { authorization: createBearerAuthorizationHeader('clone-test') },
            payload,
        });
    }

    async function fakeGit(script: string) {
        await writeFile(projects.path('demo', '.bin/git'), script);
        await chmod(projects.path('demo', '.bin/git'), 0o755);
    }

    it.each([
        'queued',
        'parallel',
    ])('cancels the real process group and cleans only owned data (%s)', async (executionPolicy) => {
        await mkdir(projects.path('.clone-other-stale'));
        await writeFile(projects.path('.clone-other-stale', 'keep'), 'keep');
        await fakeGit(`#!/bin/bash\ntrap "" TERM\necho clone-progress >&2\nsleep 30 &\necho $! > "${projects.path('child.pid')}"\nwait\n`);
        const body = (await call('clone', {
            url: projects.path('demo'),
            name: 'slow-copy',
            executionPolicy,
            timeoutSeconds: 10800,
        })).json<Reply>();

        expect(body.operation.state).toBe('running');
        expect(await readdir(projects.config.projectsRoot)).not.toContain('slow-copy');
        expect((await call('clone', {
            url: projects.path('demo'),
            name: 'slow-copy',
            executionPolicy: 'parallel',
        })).json<Reply>())
            .toMatchObject({ code: 'conflict' });
        const pid = Number(await readFile(projects.path('child.pid'), 'utf8'));

        await call('operation_cancel', { id: body.operation.id });
        await expect.poll(
            async () => (await call('operation_status', { id: body.operation.id })).json<Reply>().operation.state,
            { timeout: 4000 }
        ).toBe('cancelled');
        const retained = (await call('operation_result', { id: body.operation.id })).json<Reply>();

        expect(retained.operation.changedPaths).toEqual([]);
        expect(retained.logs?.map((entry) => entry.text).join('')).toContain('clone-progress');
        // A killed orphan may briefly remain a zombie until the system reaps it.
        try {
            const status = await readFile(`/proc/${pid}/stat`, 'utf8');

            expect(status.split(' ')[2]).toBe('Z');
        } catch (error) {
            expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
        }

        expect((await readdir(projects.config.projectsRoot)).filter((name) => name.startsWith('.clone-'))).toEqual(['.clone-other-stale']);
        expect(await readFile(projects.path('.clone-other-stale', 'keep'), 'utf8')).toBe('keep');
    }, 12000);

    it.each([
        'queued',
        'parallel',
    ])('times out a real clone without polls (%s)', async (executionPolicy) => {
        await fakeGit('#!/bin/bash\nif [[ "$1" == clone ]]; then sleep 30; else echo main; fi\n');
        const timed = (await call('clone', {
            url: projects.path('demo'),
            name: 'expired',
            timeoutSeconds: 1,
            executionPolicy,
        })).json<Reply>();

        expect(timed.operation.state).toBe('timed_out');
        expect((await readdir(projects.config.projectsRoot)).filter((name) => name.startsWith('.clone-'))).toEqual([]);
        expect((await call('operation_result', { id: timed.operation.id })).json()).toMatchObject({ result: { code: 'timed_out' } });
    }, 8000);

    it('never replaces an unrelated empty directory created before publication', async () => {
        await fakeGit(`#!/bin/bash\nif [[ "$1" == clone ]]; then mkdir -p "\${@: -1}/.git"; mkdir "${projects.path('raced')}"; else echo main; fi\n`);
        const raced = (await call('clone', {
            url: projects.path('demo'),
            name: 'raced',
            executionPolicy: 'parallel',
        })).json<Reply>();

        expect(raced).toMatchObject({
            code: 'conflict',
            operation: {
                state: 'failed',
                changedPaths: [],
            },
        });
        expect(await readdir(projects.path('raced'))).toEqual([]);
        expect((await readdir(projects.config.projectsRoot)).filter((name) => name.startsWith('.clone-'))).toEqual([]);
    });

    it('leaves stale reservations untouched and cleans a failed clone', async () => {
        await mkdir(projects.path('.clone-reserved.lock'));
        expect((await call('clone', {
            url: projects.path('demo'),
            name: 'reserved',
        })).json<Reply>().code).toBe('conflict');
        await fakeGit('#!/bin/bash\necho failure >&2\nexit 2\n');
        expect((await call('clone', {
            url: projects.path('demo'),
            name: 'failed',
        })).json<Reply>().code).toBe('command_failed');
        expect((await readdir(projects.config.projectsRoot)).filter((name) => name.startsWith('.clone-'))).toEqual(['.clone-reserved.lock']);
    });
    it('reports a published clone when cancellation wins after atomic rename', async () => {
        const script = '#!/bin/bash\n/usr/bin/python3 "$@" || exit $?\necho published\ntrap "" TERM\nsleep 30 &\nwait\n';

        await writeFile(projects.path('demo', '.bin/python3'), script);
        await chmod(projects.path('demo', '.bin/python3'), 0o755);
        const body = (await call('clone', {
            url: projects.path('demo'),
            name: 'published',
            executionPolicy: 'parallel',
        })).json<Reply>();

        expect(body.operation.state).toBe('running');
        expect(await readFile(projects.path('published', 'README.md'), 'utf8')).toBe('hello');
        await call('operation_cancel', { id: body.operation.id });
        await expect.poll(
            async () => (await call('operation_status', { id: body.operation.id })).json<Reply>().operation.state,
            { timeout: 4000 }
        ).toBe('cancelled');
        expect((await call('operation_result', { id: body.operation.id })).json<Reply>().operation.changedPaths).toEqual(['published']);
        expect(await readFile(projects.path('published', 'README.md'), 'utf8')).toBe('hello');
        expect((await readdir(projects.config.projectsRoot)).filter((name) => name.startsWith('.clone-'))).toEqual([]);
    }, 12000);
});
