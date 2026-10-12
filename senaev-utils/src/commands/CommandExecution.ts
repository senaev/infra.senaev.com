import { setImmediate as yieldImmediate } from 'node:timers/promises';

/** Host capabilities available to a command, independent of any protocol or manager. */
export type CommandExecution = {
    readonly signal: AbortSignal;
    checkpoint: () => Promise<void>;
    throwIfAborted: () => void;
    log: (stream: 'stdout' | 'stderr', text: string) => void;
    changedPath: (path: string) => void;
};

/** A standalone caller can supply cancellation and observers without an operation backend. */
export function createCommandExecution(options: {
    signal?: AbortSignal;
    log?: CommandExecution['log'];
    changedPath?: CommandExecution['changedPath'];
} = {}): CommandExecution {
    const signal = options.signal ?? new AbortController().signal;

    return {
        signal,
        throwIfAborted: () => signal.throwIfAborted(),
        checkpoint: async () => {
            signal.throwIfAborted();
            await yieldImmediate();
            signal.throwIfAborted();
        },
        log: options.log ?? (() => {}),
        changedPath: options.changedPath ?? (() => {}),
    };
}

export type Command<Config, Input, Output> = (config: Config, input: Input, execution: CommandExecution) => Promise<Output>;
