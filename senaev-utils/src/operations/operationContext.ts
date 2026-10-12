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

/** Capture manager capabilities at the adapter boundary; business code receives them explicitly. */
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
