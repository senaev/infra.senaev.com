import {
    describe, expect, it, vi,
} from 'vitest';

import type { OperationLaunchReply } from '../operations/operationTypes';
import type { CommandExecution } from '../commands/CommandExecution';

import { createManagedToolService } from './createManagedToolService';
import { readToolArguments } from './toolArguments';

function fixture() {
    const run = vi.fn((_config: unknown, input: unknown, execution: CommandExecution) => {
        const args = readToolArguments(input, ['value']);

        execution.log('stdout', 'host output');
        execution.changedPath('published.txt');

        return Promise.resolve({
            value: args.value,
            hasExecutionContext: execution.signal instanceof AbortSignal,
        });
    });
    const service = createManagedToolService({
        backend: 'test',
        logger: { error: vi.fn() },
        config: {},
        tools: { echo: run },
        argumentKeys: () => ['value'],
    });

    return {
        run,
        service,
    };
}

describe('managed command boundary', () => {
    it.each([
        'queued',
        'parallel',
    ] as const)('keeps execution fields outside the domain handler for %s', async (executionPolicy) => {
        const { run, service } = fixture();
        const args = {
            value: 42,
            executionPolicy,
            timeoutSeconds: 120,
            requestId: executionPolicy,
        };

        try {
            const first = await service.call('echo', args) as OperationLaunchReply;
            const repeat = await service.call('echo', { ...args });

            expect(first).toMatchObject({
                value: 42,
                hasExecutionContext: true,
                operation: {
                    state: 'completed',
                    executionPolicy,
                    timeoutSeconds: 120,
                },
            });
            expect(repeat).toEqual(first);
            expect(run).toHaveBeenCalledExactlyOnceWith({}, { value: 42 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
            await expect(service.call('echo', {
                ...args,
                executionPolicy: executionPolicy === 'queued' ? 'parallel' : 'queued',
            })).rejects.toThrow(/different arguments/);
            expect(await service.call('operation_result', { id: first.operation.id })).toMatchObject({
                result: { value: 42 },
                operation: { changedPaths: ['published.txt'] },
                logs: [
                    {
                        stream: 'stdout',
                        text: 'host output',
                    },
                ],
            });
        } finally {
            await service.close();
        }
    });

    it('rejects unknown fields and invalid execution controls before dispatch', async () => {
        const { run, service } = fixture();

        try {
            expect(() => service.call('echo', { typo: 1 })).toThrow(/Unknown argument/);
            await expect(service.call('echo', { timeoutSeconds: 0 })).rejects.toThrow(/positive integer/);
            await expect(service.call('echo', { executionPolicy: 'other' })).rejects.toThrow(/queued or parallel/);
            expect(run).not.toHaveBeenCalled();
        } finally {
            await service.close();
        }
    });
});
