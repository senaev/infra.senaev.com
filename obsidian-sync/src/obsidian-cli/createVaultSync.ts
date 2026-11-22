import { runContinuousSync } from './runContinuousSync';
import { setUpVaultSync } from './setUpVaultSync';

/**
 * The `ob` commands of the service. The part owns their cancellation: `close()` aborts the command
 * that runs, so the entry point needs no abort signal of its own. It does not wait for the command
 * to end.
 */
export function createVaultSync() {
    const controller = new AbortController();

    return {
        setUp: () => setUpVaultSync(controller.signal),
        /** Settles only when sync stops: with a rejection if it dies, and normally after `close()`. */
        runContinuous: () => {
            if (controller.signal.aborted) {
                return Promise.resolve();
            }

            return runContinuousSync(controller.signal);
        },
        close: () => {
            controller.abort(new Error('Service stopping'));
        },
    };
}
