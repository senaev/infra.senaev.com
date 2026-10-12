import {
    describe, expect, it, vi,
} from 'vitest';

import { CommandError } from '../commands/CommandError';

import { OperationManager } from './OperationManager';
import type { OperationObservation } from './operationTypes';

describe('operation retention regressions', () => {
    it('bounds error results and survives circular diagnostic details', async () => {
        const reportError = vi.fn();
        const manager = new OperationManager('test', reportError);

        try {
            const oversized = await manager.launch({
                tool: 'error',
                args: {},
                run: () => {
                    throw new CommandError('ambiguous', 'many matches', { lines: Array(510000).fill(1) });
                },
            });

            expect(oversized).toMatchObject({
                code: 'command_failed',
                operation: { state: 'failed' },
            });
            expect(JSON.stringify(await manager.control('operation_result', { id: oversized.operation.id })).length).toBeLessThan(2000);
            const circular: Record<string, unknown> = {};

            circular.self = circular;
            const failed = await manager.launch({
                tool: 'error',
                args: {},
                run: () => {
                    throw new CommandError('conflict', 'circular', circular);
                },
            });

            expect(reportError).toHaveBeenCalledTimes(1);
            expect(failed).toMatchObject({
                code: 'internal_error',
                operation: { state: 'failed' },
            });
            expect((await manager.launch({
                tool: 'next',
                args: {},
                run: () => Promise.resolve({ ok: true }),
            })).ok).toBe(true);
        } finally {
            await manager.close();
        }
    });

    it('packs tiny chunks and resumes inside a chunk extended after polling', async () => {
        const manager = new OperationManager('test');
        let release: () => void = () => undefined;
        let logged: () => void = () => undefined;
        const ready = new Promise<void>((resolve) => {
            logged = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const launch = manager.launch({
            tool: 'logs',
            args: { requestId: 'packed' },
            run: async (execution) => {
                for (let i = 0; i < 20000; i++) {
                    execution?.log('stdout', 'x');
                }

                logged();
                await gate;
                execution?.log('stdout', 'tail');

                return {};
            },
        });

        await ready;
        const retry = await manager.launch({
            tool: 'logs',
            args: { requestId: 'packed' },
            run: () => Promise.resolve({}),
        });
        const first = await manager.control('operation_status', { id: retry.operation.id }) as OperationObservation;

        expect(first.logs).toHaveLength(1);
        expect(first.logs[0]?.text).toBe('x'.repeat(20000));
        release();
        await launch;
        const second = await manager.control('operation_result', {
            id: retry.operation.id,
            cursor: first.nextCursor,
        }) as OperationObservation;

        expect(second.logs.map((log) => log.text).join('')).toBe('tail');
        expect((await manager.control('operation_result', { id: retry.operation.id }) as OperationObservation).logs[0]?.text).toBe(`${'x'.repeat(20000)}tail`);
        await manager.close();
    });

    it('pages alternating escaped chunks within the existing JSON log page quota', async () => {
        const manager = new OperationManager('test');
        const result = await manager.launch({
            tool: 'logs',
            args: {},
            run: (execution) => {
                for (let i = 0; i < 4000; i++) {
                    execution?.log(i % 2 === 0 ? 'stdout' : 'stderr', '\n');
                }

                return Promise.resolve({});
            },
        });
        let cursor = 0;
        let text = '';

        for (;;) {
            const page = await manager.control('operation_result', {
                id: result.operation.id,
                cursor,
            }) as OperationObservation;

            expect(JSON.stringify(page.logs).length).toBeLessThanOrEqual(30000);
            text += page.logs.map((log) => log.text).join('');
            if (page.nextCursor === cursor) {
                break;
            }

            cursor = page.nextCursor;
        }

        expect(text).toBe('\n'.repeat(4000));
        await manager.close();
    });
});
