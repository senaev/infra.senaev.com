import { runContinuousSync } from './runContinuousSync';
import { setUpVaultSync } from './setUpVaultSync';

/**
 * The `ob` commands of the service. The part owns their cancellation: `close()` stops the command
 * that runs and waits until it has ended, so the entry point needs no abort signal of its own.
 */
export function createVaultSync() {
    const controller = new AbortController();
    let settingUp: Promise<void> | undefined;
    let continuous: Promise<void> | undefined;

    return {
        setUp: () => {
            settingUp = setUpVaultSync(controller.signal);

            return settingUp;
        },
        /** Settles only when sync stops: with a rejection if it dies, and normally after `close()`. */
        runContinuous: () => {
            if (controller.signal.aborted) {
                return Promise.resolve();
            }

            continuous = runContinuousSync(controller.signal);

            return continuous;
        },
        close: async () => {
            controller.abort(new Error('Service stopping'));
            // The caller of `setUp` gets its failure; here it only has to have ended.
            await settingUp?.catch(() => undefined);
            await continuous;
        },
    };
}
