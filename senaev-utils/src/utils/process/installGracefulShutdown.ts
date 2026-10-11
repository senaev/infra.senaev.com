const SHUTDOWN_GRACE_MS = 10_000;

type ShutdownOptions = {
    stop: () => Promise<unknown>;
    reportError: (error: unknown) => void;
};

/** Process lifecycle only: services supply their own resource cleanup. */
export function installGracefulShutdown({ stop, reportError }: ShutdownOptions) {
    const controller = new AbortController();
    let pending: Promise<void> | undefined;
    const onSignal = () => {
        void shutdown();
    };
    const dispose = () => {
        process.removeListener('SIGTERM', onSignal);
        process.removeListener('SIGINT', onSignal);
    };
    const report = (error: unknown) => {
        try {
            reportError(error);
        } catch {
            // Diagnostics must not prevent process termination.
        }
    };
    const shutdown = (exitCode = 0): Promise<void> => {
        pending ??= Promise.resolve().then(async () => {
            controller.abort(new Error('Service stopping'));
            const timer = setTimeout(() => {
                report(new Error('Service cleanup exceeded shutdown grace'));
                process.exit(1);
            }, SHUTDOWN_GRACE_MS);

            timer.unref();
            let outcome = exitCode;

            try {
                await stop();
            } catch (error) {
                report(error);
                outcome = 1;
            } finally {
                clearTimeout(timer);
                dispose();
            }

            process.exit(outcome);
        });

        return pending;
    };

    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);

    return {
        signal: controller.signal,
        shutdown,
        dispose,
    };
}
