type ShutdownSignal = 'SIGTERM' | 'SIGINT';

type ShutdownProcess = {
    on: (event: ShutdownSignal, listener: () => void) => unknown;
    once: (event: ShutdownSignal, listener: () => void) => unknown;
    removeListener: (event: ShutdownSignal, listener: () => void) => unknown;
    exit: (code: number) => unknown;
};

type ShutdownOptions = {
    process: ShutdownProcess;
    reportError: (error: unknown) => void;
    /** Time allowed for cleanup. Use null to wait for all callbacks. */
    graceMs?: number | null;
    /** Let Node's default handler take over if the same signal arrives again. */
    forceExitOnRepeatedSignal?: boolean;
};

const DEFAULT_SHUTDOWN_GRACE_MS = 10_000;

/**
 * On SIGTERM, SIGINT, or an explicit shutdown, aborts the signal and awaits each registered
 * closer in reverse order. Reports cleanup failures and continues through the remaining closers.
 * The process exits with the requested code, or with 1 if cleanup fails or exceeds its deadline.
 */
export function createShutdownController({
    process,
    reportError,
    graceMs = DEFAULT_SHUTDOWN_GRACE_MS,
    forceExitOnRepeatedSignal = false,
}: ShutdownOptions) {
    const controller = new AbortController();
    const closers: (() => unknown)[] = [];
    let pending: Promise<void> | undefined;

    function report(error: unknown): void {
        try {
            reportError(error);
        } catch {
            // Diagnostics must not prevent process termination.
        }
    }

    async function closeResources(exitCode: number): Promise<number> {
        controller.abort(new Error('Service stopping'));

        let outcome = exitCode;

        for (const close of [...closers].reverse()) {
            try {
                await close();
            } catch (error) {
                report(error);
                outcome = 1;
            }
        }

        return outcome;
    }

    const onSignal = () => {
        void shutdown();
    };

    function shutdown(exitCode = 0): Promise<void> {
        // Abort listeners can reenter shutdown, so assign the promise before cleanup starts.
        pending ??= Promise.resolve().then(async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            let outcome: number;

            if (graceMs === null) {
                outcome = await closeResources(exitCode);
            } else {
                const deadline = new Promise<number>((resolve) => {
                    timer = setTimeout(() => {
                        report(new Error('Service cleanup exceeded shutdown grace'));
                        resolve(1);
                    }, graceMs);
                    timer.unref();
                });

                outcome = await Promise.race([
                    closeResources(exitCode),
                    deadline,
                ]);
            }

            clearTimeout(timer);
            process.removeListener('SIGTERM', onSignal);
            process.removeListener('SIGINT', onSignal);
            process.exit(outcome);
        });

        return pending;
    }

    const listen = forceExitOnRepeatedSignal ? 'once' : 'on';

    process[listen]('SIGTERM', onSignal);
    process[listen]('SIGINT', onSignal);

    return {
        signal: controller.signal,
        shutdown,
        subscribeShutdown: (close: () => unknown) => {
            closers.push(close);
        },
    };
}
