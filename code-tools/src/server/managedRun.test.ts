import { readFile } from 'node:fs/promises';

import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createTestProjects, type TestProjects } from '../tools/createTestProjects';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

const TOKEN = 'run-test';
const HEADERS = { authorization: createBearerAuthorizationHeader(TOKEN) };

type Reply = {
    status: string; code?: string; exitCode?: number; stdout?: string; outputTruncated?: boolean;
    operation: { id: string; state: string; timeoutSeconds: number; startedAt: number | null; updatedAt: number };
    result?: { exitCode?: number; stdout?: string; outputTruncated?: boolean; code?: string };
    logs?: { cursor: number; stream: string; text: string }[];
    nextCursor?: number;
};

describe('managed shell execution', () => {
    let projects: TestProjects;
    let server: CodeToolsServer;

    beforeEach(async () => {
        projects = await createTestProjects({ demo: { 'README.md': 'repair access' } });
        server = createCodeToolsServer(TOKEN, projects.config);
    });
    afterEach(async () => {
        await server.close();
        await projects.remove();
    });
    function call(tool: string, payload: Record<string, unknown> = {}) {
        return server.inject({
            method: 'POST',
            url: `/code/${tool}`,
            headers: HEADERS,
            payload,
        });
    }

    function run(command: string, args: Record<string, unknown> = {}) {
        return call('run', {
            project: 'demo',
            command,
            ...args,
        });
    }

    it('retains a nonzero exit as a failed command result and deduplicates mutations', async () => {
        const args = {
            requestId: 'once',
            timeoutSeconds: 10800,
        };
        const first = (await run('echo once >> counter; echo out; echo err >&2; exit 7', args)).json<Reply>();
        const duplicate = (await run('echo once >> counter; echo out; echo err >&2; exit 7', args)).json<Reply>();

        expect(first).toMatchObject({
            status: 'ok',
            exitCode: 7,
            stdout: 'out\n',
            operation: {
                state: 'failed',
                timeoutSeconds: 10800,
            },
        });
        expect(duplicate.operation.id).toBe(first.operation.id);
        expect(await readFile(projects.path('demo', 'counter'), 'utf8')).toBe('once\n');
        expect((await call('operation_result', { id: first.operation.id })).json<Reply>().result?.exitCode).toBe(7);
        expect((await run('true', args)).statusCode).toBe(409);
    });

    it('retains signal termination as a failed command outcome', async () => {
        const body = (await run('kill -TERM $$')).json<Reply>();

        expect(body).toMatchObject({
            exitCode: null,
            signal: 'SIGTERM',
            operation: { state: 'failed' },
        });
        expect((await call('operation_result', { id: body.operation.id })).json())
            .toMatchObject({
                result: {
                    exitCode: null,
                    signal: 'SIGTERM',
                },
                operation: { state: 'failed' },
            });
    });

    it('streams logs, cancels queued work and holds the shared slot until group cleanup', async () => {
        const active = (await run('trap \'\' TERM; (trap \'\' TERM; sleep 30) & echo ready; echo diagnostic >&2; wait')).json<Reply>();
        const { id } = active.operation;

        expect(active.operation).toMatchObject({
            state: 'running',
            timeoutSeconds: 60,
        });
        const status = (await call('operation_status', { id })).json<Reply>();

        expect(status.logs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                stream: 'stdout',
                text: 'ready\n',
            }),
            expect.objectContaining({
                stream: 'stderr',
                text: 'diagnostic\n',
            }),
        ]));
        expect((await call('operation_status', {
            id,
            cursor: status.nextCursor,
        })).json<Reply>().logs).toEqual([]);
        const parallelArgs = {
            executionPolicy: 'parallel',
            requestId: 'parallel-once',
        };
        const parallel = (await run('echo independent', parallelArgs)).json<Reply>();

        expect(parallel).toMatchObject({
            stdout: 'independent\n',
            operation: {
                executionPolicy: 'parallel',
                state: 'completed',
            },
        });
        expect((await run('echo independent', parallelArgs)).json<Reply>()).toEqual(parallel);
        expect((await run('echo independent', {
            ...parallelArgs,
            executionPolicy: 'queued',
        })).statusCode).toBe(409);
        expect((await call('operation_result', { id: parallel.operation.id })).json<Reply>())
            .toMatchObject({ result: { stdout: 'independent\n' } });
        expect((await call('operation_status', { id })).json<Reply>().operation.state).toBe('running');
        const queued = (await run('echo should-not-run > forbidden', { timeoutSeconds: 1 })).json<Reply>();

        expect(queued.operation.state).toBe('queued');
        expect((await call('operation_cancel', { id: queued.operation.id })).json<Reply>().operation).toMatchObject({
            state: 'cancelled',
            startedAt: null,
        });
        const read = await call('read', {
            project: 'demo',
            paths: ['README.md'],
        });

        expect(read.statusCode).toBe(200);
        const before = performance.now();

        await call('operation_cancel', { id });
        const next = (await call('projects')).json<Reply>();

        expect(next.operation.state).toBe('queued');
        await vi.waitFor(async () => {
            expect((await call('operation_status', { id })).json<Reply>().operation.state).toBe('cancelled');
        }, { timeout: 4000 });
        expect(performance.now() - before).toBeGreaterThanOrEqual(900);
        await vi.waitFor(async () => {
            expect((await call('operation_result', { id: next.operation.id })).json<Reply>().operation.state).toBe('completed');
        });
        await expect(readFile(projects.path('demo', 'forbidden'))).rejects.toMatchObject({ code: 'ENOENT' });
    }, 12000);

    it('terminates TERM-resistant subprocesses at the runtime deadline without polling', async () => {
        const before = performance.now();
        const body = (await run('trap \'\' TERM; (trap \'\' TERM; sleep 30) & echo started; wait', { timeoutSeconds: 1 })).json<Reply>();

        expect(body).toMatchObject({
            status: 'error',
            code: 'timed_out',
            operation: { state: 'timed_out' },
        });
        expect(performance.now() - before).toBeGreaterThanOrEqual(1900);
        expect(performance.now() - before).toBeLessThan(4500);
        expect((await call('operation_result', { id: body.operation.id })).json<Reply>()).toMatchObject({
            result: { code: 'timed_out' },
            logs: expect.arrayContaining([expect.objectContaining({ text: 'started\n' })]),
        });
        expect((await run('printf recovered')).json<Reply>().stdout).toBe('recovered');
    }, 8000);

    it('keeps output bounded and rejects invalid execution parameters', async () => {
        const body = (await run('seq 1 20000')).json<Reply>();

        expect(body.outputTruncated).toBe(true);
        expect(body.stdout?.length).toBeLessThanOrEqual(30000);
        for (const timeoutSeconds of [
            0,
            -1,
            1.5,
            null,
            '60',
        ]) {
            expect((await run('true', { timeoutSeconds })).statusCode).toBe(400);
        }

        expect((await run('true', { mode: 'async' })).statusCode).toBe(400);
        expect((await run('true', { waitSeconds: 5 })).statusCode).toBe(400);
    });
});
