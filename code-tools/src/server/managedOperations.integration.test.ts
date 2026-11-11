import { completeOperation } from 'senaev-utils/src/operations/testing/completeOperation';
import type { OperationLaunchReply, OperationObservation } from 'senaev-utils/src/operations/operationTypes';
import { OperationManager } from 'senaev-utils/src/operations/OperationManager';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { CODE_TOOLS } from '../tools/codeTools';
import { createTestProjects, type TestProjects } from '../tools/createTestProjects';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

const TOKEN = 'managed-operations-test';
const HEADERS = { authorization: createBearerAuthorizationHeader(TOKEN) };

type Reply = {
    status: string;
    code?: string;
    entries?: unknown[];
    operation: { id: string; state: string; timeoutSeconds: number };
    operations?: { id: string; state: string }[];
    logs?: { text: string }[];
    result?: Record<string, unknown>;
    files?: { hash: string; content: string }[];
    hash?: string;
    stdout?: string;
};

function deferred() {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });

    return {
        promise,
        resolve,
    };
}

describe('managed execution HTTP contract', () => {
    let projects: TestProjects;
    let server: CodeToolsServer;

    beforeEach(async () => {
        projects = await createTestProjects({ demo: { 'README.md': 'hello\n' } });
        server = createCodeToolsServer(TOKEN, projects.config);
    });

    afterEach(async () => {
        await server.close();
        await projects.remove();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    function call(tool: string, payload: Record<string, unknown> = {}) {
        return server.inject({
            method: 'POST',
            url: `/code/${tool}`,
            headers: HEADERS,
            payload,
        });
    }

    async function completed(tool: string, payload: Record<string, unknown>) {
        return await completeOperation(
            (await call(tool, payload)).json<OperationLaunchReply>(),
            async (args) => (await call('operation_result', args)).json<OperationObservation>()
        ) as unknown as Reply;
    }

    function list(args: Record<string, unknown> = {}) {
        return call('list', {
            folder: projects.root,
            ...args,
        });
    }

    function holdList() {
        const started = deferred();
        const run = vi.spyOn(CODE_TOOLS, 'list').mockImplementation((_config, _input, execution) => new Promise((resolve) => {
            const context = execution;

            context?.log('stdout', 'started\n');
            context?.log('stderr', 'diagnostic\n');
            context?.signal.addEventListener('abort', () => resolve({ entries: [] }), { once: true });
            started.resolve();
        }));

        return {
            started: started.promise,
            run,
        };
    }

    it('returns a fast real result and exposes the same result through authenticated controls', async () => {
        const response = await list();
        const body = response.json<Reply>();

        expect(response.statusCode).toBe(200);
        expect(body).toMatchObject({
            status: 'ok',
            entries: [
                {
                    path: projects.path('demo'),
                    type: 'folder',
                },
            ],
            operation: {
                state: 'completed',
                timeoutSeconds: 60,
            },
        });
        const { id } = body.operation;

        expect((await call('operation_result', { id })).json<Reply>()).toMatchObject({
            result: { entries: body.entries },
            operation: {
                id,
                state: 'completed',
            },
        });
        expect((await call('operations')).json<Reply>().operations).toContainEqual(expect.objectContaining({ id }));
        for (const tool of [
            'list',
            'operations',
            'operation_status',
            'operation_result',
            'operation_cancel',
        ]) {
            const unauthorized = await server.inject({
                method: 'POST',
                url: `/code/${tool}`,
                payload: { id },
            });

            expect(unauthorized.statusCode).toBe(401);
        }
    });

    it('does not abort execution when the observation client disconnects', async () => {
        const started = deferred();
        const complete = deferred();
        let signal: AbortSignal | undefined;

        vi.spyOn(CODE_TOOLS, 'list').mockImplementation(async (_config, _input, execution) => {
            signal = execution?.signal;
            started.resolve();
            await complete.promise;

            return { entries: [] };
        });
        const address = await server.listen({
            host: '127.0.0.1',
            port: 0,
        });
        const client = new AbortController();
        const response = fetch(`${address}/code/list`, {
            method: 'POST',
            headers: {
                ...HEADERS,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ folder: projects.root }),
            signal: client.signal,
        }).catch((error: unknown) => error);

        await started.promise;
        client.abort();
        await response;
        expect(signal?.aborted).toBe(false);
        const id = (await call('operations')).json<Reply>().operations?.[0]?.id;

        expect((await call('operation_status', { id })).json<Reply>().operation.state).toBe('running');
        complete.resolve();
        await vi.waitFor(async () => {
            expect((await call('operation_result', { id })).json<Reply>().operation.state).toBe('completed');
        });
    });

    it('forgets old IDs when the backend server is recreated', async () => {
        const reply = (await list()).json<Reply>();

        await server.close();
        server = createCodeToolsServer(TOKEN, projects.config);
        expect((await call('operation_status', { id: reply.operation.id })).statusCode).toBe(404);
        expect((await call('operations')).json<Reply>().operations).toEqual([]);
    });

    it('returns a running handle after five seconds, with replayable logs and cancellation', async () => {
        const { run } = holdList();
        const started = performance.now();
        const response = await list({
            timeoutSeconds: 10800,
            requestId: 'slow',
        });
        const body = response.json<Reply>();
        const { id } = body.operation;

        expect(performance.now() - started).toBeGreaterThanOrEqual(4900);
        expect(body).toMatchObject({
            status: 'ok',
            operation: {
                state: 'running',
                timeoutSeconds: 10800,
            },
        });
        const status = (await call('operation_status', { id })).json<Reply>();

        expect(status.logs).toEqual([
            expect.objectContaining({ text: 'started\n' }),
            expect.objectContaining({ text: 'diagnostic\n' }),
        ]);
        expect((await call('operation_status', { id })).json<Reply>()).toEqual(status);
        expect((await list({
            timeoutSeconds: 10800,
            requestId: 'slow',
        })).json<Reply>().operation.id).toBe(id);
        expect(run).toHaveBeenCalledTimes(1);
        await call('operation_cancel', { id });
        await vi.waitFor(async () => {
            expect((await call('operation_result', { id })).json<Reply>()).toMatchObject({
                operation: { state: 'cancelled' },
                result: { code: 'cancelled' },
            });
        }, { timeout: 3000 });
    }, 10000);

    it('immediately queues five, rejects overflow and allows parallel file commands', async () => {
        const { started, run } = holdList();
        const active = list({ requestId: 'active' });

        await started;
        const before = performance.now();
        const queued: string[] = [];

        for (let index = 0; index < 5; index++) {
            const body = (await list({ requestId: `q${index}` })).json<Reply>();

            expect(body.operation.state).toBe('queued');
            queued.push(body.operation.id);
        }

        expect(performance.now() - before).toBeLessThan(3000);
        const overflow = await list();

        expect(overflow.statusCode).toBe(429);
        expect(overflow.json<Reply>().code).toBe('QUEUE_FULL');
        expect((await call('operations')).json<Reply>().operations).toHaveLength(6);
        expect((await list({ requestId: 'q0' })).json<Reply>().operation.id).toBe(queued[0]);

        expect((await call('run', {
            cwd: projects.path('demo'),
            command: 'printf direct',
        })).statusCode).toBe(429);
        const read = await completed('read', {
            executionPolicy: 'parallel',
            paths: [projects.path('demo', 'README.md')],
        });
        const write = await completed('write', {
            executionPolicy: 'parallel',
            path: projects.path('demo', 'README.md'),
            expectedHash: read.files?.[0]?.hash,
            content: 'updated\n',
        });

        expect(write.operation.state).toBe('completed');
        const patch = await completed('patch', {
            executionPolicy: 'parallel',
            path: projects.path('demo', 'README.md'),
            expectedHash: write.hash,
            operations: [
                {
                    find: 'updated',
                    replace: 'patched',
                },
            ],
        });

        expect(patch.operation.state).toBe('completed');
        expect((await completed('read', {
            executionPolicy: 'parallel',
            paths: [projects.path('demo', 'README.md')],
        })).files?.[0]?.content).toBe('patched\n');
        for (const id of queued) {
            expect((await call('operation_cancel', { id })).json<Reply>().operation.state).toBe('cancelled');
        }

        const id = (await call('operations')).json<Reply>().operations?.find((entry) => entry.state === 'running')?.id;

        await call('operation_cancel', { id });
        await active;
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('enforces the runtime deadline without subsequent observation calls', async () => {
        await server.ready();
        vi.useFakeTimers({
            toFake: [
                'setTimeout',
                'clearTimeout',
                'Date',
                'performance',
            ],
        });
        const { started } = holdList();
        const pending = list({ timeoutSeconds: 1 });

        await started;
        await vi.advanceTimersByTimeAsync(1000);
        const response = await pending;

        expect(response.json<Reply>()).toMatchObject({
            status: 'error',
            code: 'timed_out',
            operation: {
                state: 'timed_out',
                timeoutSeconds: 1,
            },
        });
    });

    it('all domain tools depend on managed admission', async () => {
        const launch = vi.spyOn(OperationManager.prototype, 'launch').mockRejectedValue(new CommandError('conflict', 'Unavailable'));

        expect((await call('read', {
            executionPolicy: 'parallel',
            paths: [projects.path('demo', 'README.md')],
        })).statusCode).toBe(409);
        expect(launch).toHaveBeenCalledTimes(1);
        expect((await list()).statusCode).toBe(409);
    });

    it('rejects invalid launch/control arguments and foreign IDs without admitting work', async () => {
        for (const payload of [
            { timeoutSeconds: 0 },
            { timeoutSeconds: 1.5 },
            { timeoutSeconds: null },
            { requestId: '' },
            { requestId: 123 },
            { mode: 'async' },
            { waitSeconds: 5 },
        ]) {
            expect((await list(payload)).statusCode).toBe(400);
        }

        expect((await call('operations')).json<Reply>().operations).toEqual([]);
        expect((await call('operation_status')).statusCode).toBe(400);
        expect((await call('operation_cancel', {
            id: 'x',
            cursor: 0,
        })).statusCode).toBe(400);
        expect((await call('operation_result', {
            id: 'x',
            offset: null,
        })).statusCode).toBe(400);
        expect((await call('operation_status', { id: 'obsidian-foreign' })).statusCode).toBe(404);
    });

    it('retains a fast execution failure as a terminal failed operation', async () => {
        vi.spyOn(CODE_TOOLS, 'list').mockRejectedValue(new CommandError('command_failed', 'ripgrep failed'));
        const body = (await list()).json<Reply>();

        expect(body).toMatchObject({
            status: 'error',
            code: 'command_failed',
            operation: { state: 'failed' },
        });
        expect((await call('operation_result', { id: body.operation.id })).json<Reply>().result).toMatchObject({ code: 'command_failed' });
    });
});
