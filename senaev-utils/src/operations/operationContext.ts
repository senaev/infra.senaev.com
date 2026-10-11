import { AsyncLocalStorage } from 'node:async_hooks';
import { setImmediate as yieldImmediate } from 'node:timers/promises';

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

export function throwIfOperationAborted(): void {
    contexts.getStore()?.signal.throwIfAborted();
}

/** Yield to timers and cancellation HTTP requests between bounded batches. */
export async function operationCheckpoint(): Promise<void> {
    throwIfOperationAborted();
    if (contexts.getStore() !== undefined) {
        await yieldImmediate();
    }

    throwIfOperationAborted();
}

export function recordChangedPath(path: string): void {
    contexts.getStore()?.changedPaths.add(path);
}

/** Chunk long deadlines: Node timers overflow above about 24 days. */
export function scheduleDeadline(seconds: number, abort: () => void): () => void {
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = () => {
        const remaining = seconds - (performance.now() - started) / 1000;

        if (remaining <= 0) {
            abort();
        } else if (!stopped) {
            timer = setTimeout(tick, Math.min(remaining * 1000, 2_147_483_647));
        }
    };

    tick();

    return () => {
        stopped = true;
        clearTimeout(timer);
    };
}
