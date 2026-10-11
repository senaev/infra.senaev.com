import {
    describe, expect, it,
} from 'vitest';

import type {
    OperationLaunchReply, OperationObservation, OperationView,
} from '../operationTypes';

import { completeOperation } from './completeOperation';

const operation: OperationView = {
    id: 'test-id',
    backend: 'test',
    tool: 'read',
    state: 'running',
    queuedAt: 0,
    startedAt: 0,
    updatedAt: 0,
    timeoutSeconds: 60,
    executionPolicy: 'parallel',
    changedPaths: [],
    pollAfterMs: 1000,
};

describe('test operation client', () => {
    it('resolves a handle and all retained JSON pages before returning a dependent hash', async () => {
        const first: OperationLaunchReply = {
            status: 'ok',
            operation,
        };
        const serialized = JSON.stringify({
            hash: 'fresh',
            content: 'x'.repeat(65000),
        });
        const offsets: number[] = [];
        const reply = await completeOperation(first, (args) => {
            const offset = args.offset ?? 0;

            offsets.push(offset);

            return Promise.resolve({
                operation: {
                    ...operation,
                    state: 'completed',
                },
                logs: [],
                nextCursor: 0,
                firstAvailableCursor: 0,
                logsTruncated: false,
                resultJson: serialized.slice(offset, offset + 30000),
                nextOffset: offset + 30000 < serialized.length ? offset + 30000 : null,
            } as OperationObservation);
        });

        expect(offsets).toEqual([
            0,
            30000,
            60000,
        ]);
        expect(reply).toMatchObject({
            status: 'ok',
            hash: 'fresh',
            operation: { state: 'completed' },
        });
        expect(reply.content).toBe('x'.repeat(65000));
    });

    it('preserves a terminal failure instead of treating transport success as execution success', async () => {
        const first: OperationLaunchReply = {
            status: 'ok',
            operation,
        };
        const reply = await completeOperation(first, () => Promise.resolve({
            operation: {
                ...operation,
                state: 'failed',
            },
            logs: [],
            nextCursor: 0,
            firstAvailableCursor: 0,
            logsTruncated: false,
            result: {
                status: 'error',
                code: 'conflict',
            },
        }));

        expect(reply).toMatchObject({
            status: 'error',
            code: 'conflict',
            operation: { state: 'failed' },
        });
    });
});
