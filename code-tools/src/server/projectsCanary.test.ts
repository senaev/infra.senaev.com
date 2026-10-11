import { OperationManager } from 'senaev-utils/src/operations/OperationManager';
import { operationContext } from 'senaev-utils/src/operations/operationContext';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { createBearerAuthorizationHeader } from 'senaev-utils/src/utils/auth/bearerToken/bearerToken';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { CODE_TOOLS } from '../tools/codeTools';
import { createTestProjects, type TestProjects } from '../tools/createTestProjects';

import { createCodeToolsServer, type CodeToolsServer } from './createCodeToolsServer';

const TOKEN = 'canary-test';
const HEADERS = { authorization: createBearerAuthorizationHeader(TOKEN) };

type Reply = {
    status: string;
    code?: string;
    projects?: unknown[];
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

describe('projects managed-execution canary', () => {
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
    });

    function call(tool: string, payload: Record<string, unknown> = {}) {
        return server.inject({
            method: 'POST',
            url: `/code/${tool}`,
            headers: HEADERS,
            payload,
        });
    }

    function holdProjects() {
        const started = deferred();
        const run = vi.spyOn(CODE_TOOLS, 'projects').mockImplementation(() => new Promise((resolve) => {
            const context = operationContext();

            context?.log('stdout', 'started\n');
            context?.log('stderr', 'diagnostic\n');
            context?.signal.addEventListener('abort', () => resolve({ projects: [] }), { once: true });
            started.resolve();
        }));

        return {
            started: started.promise,
            run,
        };
    }

    it('returns a fast real result and exposes the same result through authenticated controls', async () => {
        const response = await call('projects');
        const body = response.json<Reply>();

        expect(response.statusCode).toBe(200);
        expect(body).toMatchObject({
            status: 'ok',
            projects: [
                {
                    name: 'demo',
                    branch: 'main',
                },
            ],
            operation: {
                state: 'completed',
                timeoutSeconds: 60,
            },
        });
        const { id } = body.operation;

        expect((await call('operation_result', { id })).json<Reply>()).toMatchObject({
            result: { projects: body.projects },
            operation: {
                id,
                state: 'completed',
            },
        });
        expect((await call('operations')).json<Reply>().operations).toContainEqual(expect.objectContaining({ id }));
        for (const tool of [
            'projects',
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

        vi.spyOn(CODE_TOOLS, 'projects').mockImplementation(async () => {
            signal = operationContext()?.signal;
            started.resolve();
            await complete.promise;

            return { projects: [] };
        });
        const address = await server.listen({
            host: '127.0.0.1',
            port: 0,
        });
        const client = new AbortController();
        const response = fetch(`${address}/code/projects`, {
            method: 'POST',
            headers: {
                ...HEADERS,
                'content-type': 'application/json',
            },
            body: '{}',
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
        const reply = (await call('projects')).json<Reply>();

        await server.close();
        server = createCodeToolsServer(TOKEN, projects.config);
        expect((await call('operation_status', { id: reply.operation.id })).statusCode).toBe(404);
        expect((await call('operations')).json<Reply>().operations).toEqual([]);
    });

    it('returns a running handle after five seconds, with replayable logs and cancellation', async () => {
        const { run } = holdProjects();
        const started = performance.now();
        const response = await call('projects', {
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
        expect((await call('projects', {
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

    it('immediately queues five, rejects overflow and keeps read/write/patch available', async () => {
        const { started, run } = holdProjects();
        const active = call('projects', { requestId: 'active' });

        await started;
        const before = performance.now();
        const queued: string[] = [];

        for (let index = 0; index < 5; index++) {
            const body = (await call('projects', { requestId: `q${index}` })).json<Reply>();

            expect(body.operation.state).toBe('queued');
            queued.push(body.operation.id);
        }

        expect(performance.now() - before).toBeLessThan(3000);
        const overflow = await call('projects');

        expect(overflow.statusCode).toBe(429);
        expect(overflow.json<Reply>().code).toBe('QUEUE_FULL');
        expect((await call('operations')).json<Reply>().operations).toHaveLength(6);
        expect((await call('projects', { requestId: 'q0' })).json<Reply>().operation.id).toBe(queued[0]);

        expect((await call('run', {
            project: 'demo',
            command: 'printf direct',
        })).statusCode).toBe(429);
        const read = (await call('read', {
            project: 'demo',
            paths: ['README.md'],
        })).json<Reply>();
        const write = await call('write', {
            project: 'demo',
            path: 'README.md',
            expectedHash: read.files?.[0]?.hash,
            content: 'updated\n',
        });

        expect(write.statusCode).toBe(200);
        const patch = await call('patch', {
            project: 'demo',
            path: 'README.md',
            expectedHash: write.json<Reply>().hash,
            operations: [
                {
                    find: 'updated',
                    replace: 'patched',
                },
            ],
        });

        expect(patch.statusCode).toBe(200);
        expect((await call('read', {
            project: 'demo',
            paths: ['README.md'],
        })).json<Reply>().files?.[0]?.content).toBe('patched\n');
        for (const id of queued) {
            expect((await call('operation_cancel', { id })).json<Reply>().operation.state).toBe('cancelled');
        }

        const id = (await call('operations')).json<Reply>().operations?.find((entry) => entry.state === 'running')?.id;

        await call('operation_cancel', { id });
        await active;
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('enforces the runtime deadline without subsequent observation calls', async () => {
        holdProjects();
        const response = await call('projects', { timeoutSeconds: 1 });

        expect(response.json<Reply>()).toMatchObject({
            status: 'error',
            code: 'timed_out',
            operation: {
                state: 'timed_out',
                timeoutSeconds: 1,
            },
        });
    });

    it('keeps repair tools direct if managed admission fails', async () => {
        const launch = vi.spyOn(OperationManager.prototype, 'launch').mockRejectedValue(new ToolError('conflict', 'Unavailable'));

        expect((await call('read', {
            project: 'demo',
            paths: ['README.md'],
        })).statusCode).toBe(200);
        expect(launch).not.toHaveBeenCalled();
        expect((await call('projects')).statusCode).toBe(409);
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
            expect((await call('projects', payload)).statusCode).toBe(400);
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
        vi.spyOn(CODE_TOOLS, 'projects').mockRejectedValue(new ToolError('command_failed', 'Git failed'));
        const body = (await call('projects')).json<Reply>();

        expect(body).toMatchObject({
            status: 'error',
            code: 'command_failed',
            operation: { state: 'failed' },
        });
        expect((await call('operation_result', { id: body.operation.id })).json<Reply>().result).toMatchObject({ code: 'command_failed' });
    });
});
