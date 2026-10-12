import { createCommandExecution, type CommandExecution } from '../CommandExecution';

/** Convert test observers into explicit capabilities; no global or async-local state. */
export function withCommandExecution<T>(options: {
    signal: AbortSignal;
    log: CommandExecution['log'];
    changedPaths: Set<string>;
}, run: (execution: CommandExecution) => Promise<T>): Promise<T> {
    return run(createCommandExecution({
        signal: options.signal,
        log: options.log,
        changedPath: (path) => options.changedPaths.add(path),
    }));
}
