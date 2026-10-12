import { AsyncLocalStorage } from 'node:async_hooks';

import { createCommandExecution, type CommandExecution } from '../commands/CommandExecution';

export type OperationContext = {
    signal: AbortSignal;
    log: (stream: 'stdout' | 'stderr', text: string) => void;
    changedPaths: Set<string>;
};

const contexts = new AsyncLocalStorage<OperationContext>();

export function withOperationContext<T>(context: OperationContext, run: () => Promise<T>): Promise<T> {
    return contexts.run(context, run);
}

export function operationContext(): OperationContext | undefined {
    return contexts.getStore();
}

/** Compatibility bridge for adapters and not-yet-migrated callers. */
export function currentCommandExecution(): CommandExecution {
    const context = contexts.getStore();

    return createCommandExecution(context === undefined
        ? {}
        : {
            signal: context.signal,
            log: context.log,
            changedPath: (path) => context.changedPaths.add(path),
        });
}

export function throwIfOperationAborted(): void {
    contexts.getStore()?.signal.throwIfAborted();
}

/** Yield between bounded batches; legacy callers use the same neutral capabilities. */
export async function operationCheckpoint(): Promise<void> {
    if (contexts.getStore() !== undefined) {
        await currentCommandExecution().checkpoint();
    }
}

export function recordChangedPath(path: string): void {
    contexts.getStore()?.changedPaths.add(path);
}

export { scheduleDeadline } from '../utils/process/scheduleDeadline';
