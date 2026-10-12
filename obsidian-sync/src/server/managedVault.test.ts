import { readFile } from 'node:fs/promises';

import { completeOperation, awaitOperation } from 'senaev-utils/src/operations/testing/completeOperation';
import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { createTestVault, type TestVault } from '../vault-tools/createTestVault';
import { VAULT_TOOLS } from '../vault-tools/vaultTools';

import { createVaultServer, type VaultServer } from './createVaultServer';
import { registerVaultToolRoutes } from './registerVaultToolRoutes';

let vault: TestVault;
let server: VaultServer;

afterEach(async () => {
    await server?.close();
    vi.restoreAllMocks();
    await vault?.remove();
});

async function setup() {
    vault = await createTestVault({ 'Note.md': '# Note\n' });
    server = createVaultServer();
    registerVaultToolRoutes(server, vault.config);
    await server.ready();
}

async function call(tool: string, body: Record<string, unknown> = {}) {
    const reply = await server.inject({
        method: 'POST',
        url: `/vault/${tool}`,
        payload: body,
    });

    return reply.json();
}

function terminal(id: string) {
    return awaitOperation(id, (args) => call('operation_result', args));
}

/** Even small worker-backed calls may outlive observation on a busy runner. */
async function completed(tool: string, args: Record<string, unknown> = {}) {
    return completeOperation(await call(tool, args), (input) => call('operation_result', input));
}

function blockSearch() {
    let release = () => {};
    let started = () => {};
    let activeSignal: AbortSignal | undefined;
    const ready = new Promise<void>((resolve) => {
        started = resolve;
    });
    const spy = vi.spyOn(VAULT_TOOLS, 'search').mockImplementation(async (_config, _input, execution) => {
        const signal = execution?.signal;

        activeSignal = signal;

        await new Promise<void>((resolve) => {
            release = resolve;
            signal?.addEventListener('abort', () => resolve(), { once: true });
            started();
        });
        execution?.throwIfAborted();

        return { released: true };
    });

    return {
        ready,
        spy,
        release: () => release(),
        signal: () => activeSignal,
    };
}

describe('managed vault routes', { timeout: 60000 }, () => {
    it.each([
        'queued',
        'parallel',
    ] as const)('runs every real domain handler through the %s manager and retains its result', async (executionPolicy) => {
        await setup();
        const requests: [string, Record<string, unknown>][] = [
            [
                'list',
                {},
            ],
            [
                'search',
                { queries: ['Note'] },
            ],
            [
                'read',
                { paths: ['Note.md'] },
            ],
            [
                'links',
                { path: 'Note.md' },
            ],
            [
                'create',
                {
                    path: 'New.md',
                    content: 'new',
                },
            ],
            [
                'diary_append',
                { text: 'record' },
            ],
        ];
        const original = await completed('read', { paths: ['Note.md'] });

        requests.push([
            'patch',
            {
                path: 'Note.md',
                expectedHash: original.notes[0].hash,
                operations: [
                    {
                        type: 'append',
                        text: 'append',
                    },
                ],
            },
        ]);
        requests.push([
            'move',
            {
                path: 'New.md',
                newPath: 'Moved.md',
            },
        ]);
        for (const [
            tool,
            input,
        ] of requests) {
            const args = {
                ...input,
                executionPolicy,
                requestId: `${executionPolicy}-${tool}`,
            };
            const first = await completed(tool, args);

            expect(first.operation).toMatchObject({
                tool,
                backend: 'obsidian',
                state: 'completed',
                executionPolicy,
            });
            expect(await completed(tool, args)).toEqual(first);
            const retained = await call('operation_result', { id: first.operation.id });
            const {
                status: _status, operation: _operation, ...result
            } = first;

            expect(retained.result).toEqual(result);
            expect((await call(tool, {
                ...args,
                executionPolicy: executionPolicy === 'queued' ? 'parallel' : 'queued',
            })).code).toBe('conflict');
        }
    });

    it('retains real mutations, retries diary append once, and detects policy conflicts', async () => {
        await setup();
        const args = {
            text: 'One record.',
            requestId: 'diary-retry',
            executionPolicy: 'parallel',
        };
        const first = await completed('diary_append', args);
        const again = await completed('diary_append', args);

        expect(first.operation).toMatchObject({
            backend: 'obsidian',
            state: 'completed',
            changedPaths: [
                '@senaev',
                vault.config.diaryDraftPath,
            ],
        });
        expect(again).toEqual(first);
        expect((await readFile(vault.path(vault.config.diaryDraftPath), 'utf8')).match(/One record\./g)).toHaveLength(1);
        expect(await call('diary_append', {
            ...args,
            executionPolicy: 'queued',
        })).toMatchObject({ code: 'conflict' });
        expect(await call('operation_result', { id: first.operation.id })).toMatchObject({
            result: {
                path: vault.config.diaryDraftPath,
                diff: first.diff,
            },
        });
        const created = await completed('create', {
            path: 'New',
            content: 'hello',
            executionPolicy: 'queued',
        });

        expect(created.operation).toMatchObject({
            state: 'completed',
            changedPaths: ['New.md'],
        });
        const read = await completed('read', {
            paths: ['New.md'],
            executionPolicy: 'parallel',
        });
        const patched = await completed('patch', {
            path: 'New.md',
            expectedHash: read.notes[0].hash,
            operations: [
                {
                    type: 'replace',
                    find: 'hello',
                    replace: 'goodbye',
                },
            ],
        });

        expect(patched.operation.state).toBe('completed');
        expect((await call('patch', {
            path: 'New.md',
            expectedHash: read.notes[0].hash,
            operations: [
                {
                    type: 'append',
                    text: 'stale',
                },
            ],
        })).code).toBe('conflict');
        const moved = await completed('move', {
            path: 'New.md',
            newPath: 'Moved.md',
        });

        expect(moved.operation).toMatchObject({
            state: 'completed',
            changedPaths: [
                'Moved.md',
                'New.md',
            ],
        });
    });

    it('uses one FIFO, runs parallel independently and never invokes cancelled queued work', async () => {
        await setup();
        const blocked = blockSearch();
        const runningReply = call('search', {
            queries: ['held'],
            timeoutSeconds: 30,
        });

        await blocked.ready;
        const queued = await call('create', { path: 'Never.md' });
        const next = await call('list');

        expect(queued.operation).toMatchObject({
            state: 'queued',
            startedAt: null,
        });
        expect(next.operation.state).toBe('queued');
        expect((await call('list', { executionPolicy: 'parallel' })).operation.state).toBe('completed');
        expect((await call('operation_status', { id: next.operation.id })).operation.state).toBe('queued');
        await call('operation_cancel', { id: queued.operation.id });
        blocked.release();
        await runningReply;
        expect((await terminal(next.operation.id)).operation.state).toBe('completed');
        expect((await terminal(queued.operation.id)).operation.changedPaths).toEqual([]);
        await expect(readFile(vault.path('Never.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('returns a handle after observation, rejects bad cancel inputs and releases running work', async () => {
        await setup();
        const blocked = blockSearch();
        const running = await call('search', {
            queries: ['held'],
            timeoutSeconds: 30,
        });

        expect(running.operation.state).toBe('running');
        expect((await call('operation_cancel', {
            id: running.operation.id,
            cursor: -1,
        })).code).toBe('invalid_arguments');
        expect((await call('operation_status', { id: running.operation.id })).operation.state).toBe('running');
        await call('operation_cancel', { id: running.operation.id });
        expect((await terminal(running.operation.id)).operation.state).toBe('cancelled');
        expect((await call('list')).operation.state).toBe('completed');
        expect(blocked.spy).toHaveBeenCalledTimes(1);
    });

    it('enforces execution timeout without polling and closes running work', async () => {
        await setup();
        const blocked = blockSearch();
        const timed = await call('search', {
            queries: ['held'],
            timeoutSeconds: 1,
            executionPolicy: 'parallel',
        });

        expect(timed.operation.state).toBe('timed_out');
        const running = await call('search', {
            queries: ['held'],
            timeoutSeconds: 30,
            executionPolicy: 'parallel',
        });

        await server.close();
        expect(running.operation.state).toBe('running');
        expect(blocked.signal()?.aborted).toBe(true);
    });
});
