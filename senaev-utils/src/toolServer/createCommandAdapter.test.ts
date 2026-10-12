import {
    describe, expect, it, vi,
} from 'vitest';

import { createCommandExecution, type CommandExecution } from '../commands/CommandExecution';

import { createCommandAdapter } from './createCommandAdapter';
import { readToolArguments, requiredString } from './toolArguments';

function fixture() {
    const parse = vi.fn((input: unknown) => {
        const args = readToolArguments(input, ['text']);

        return { text: requiredString(args, 'text') };
    });
    const execute = vi.fn((_config: { prefix: string }, input: { text: string }, execution: CommandExecution) => {
        execution.log('stdout', input.text);

        return Promise.resolve({ length: input.text.length });
    });

    return {
        parse,
        execute,
        adapter: createCommandAdapter(parse, execute),
    };
}

describe('typed command input adapter', () => {
    it('parses once and preserves the explicitly supplied capabilities and typed result', async () => {
        const {
            parse, execute, adapter,
        } = fixture();
        const execution = createCommandExecution();
        const config = { prefix: 'example' };
        const result = await adapter(config, { text: 'hello' }, execution);

        expect(result.length).toBe(5);
        expect(parse).toHaveBeenCalledExactlyOnceWith({ text: 'hello' });
        expect(execute).toHaveBeenCalledExactlyOnceWith(config, { text: 'hello' }, execution);
    });

    it('creates separate neutral capabilities for standalone adapter calls', async () => {
        const { adapter, execute } = fixture();

        await adapter({ prefix: '' }, { text: 'first' });
        await adapter({ prefix: '' }, { text: 'second' });
        const first = execute.mock.calls[0]?.[2];
        const second = execute.mock.calls[1]?.[2];

        expect(first).toBeDefined();
        expect(second).toBeDefined();
        expect(first).not.toBe(second);
        expect(first?.signal).not.toBe(second?.signal);
        expect(first?.signal.aborted).toBe(false);
        expect(second?.signal.aborted).toBe(false);
    });

    it('rejects invalid input before invoking business code', async () => {
        const { execute, adapter } = fixture();

        await expect(adapter({ prefix: '' }, { text: 42 }, createCommandExecution())).rejects.toMatchObject({ code: 'invalid_arguments' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('does not parse or execute pre-aborted input', async () => {
        const {
            parse, execute, adapter,
        } = fixture();
        const controller = new AbortController();
        const reason = new Error('already cancelled');

        controller.abort(reason);
        await expect(adapter({ prefix: '' }, {}, createCommandExecution({ signal: controller.signal }))).rejects.toBe(reason);
        expect(parse).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });
});
