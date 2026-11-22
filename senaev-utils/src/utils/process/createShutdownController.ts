type ShutdownProcess = {
    once: (event: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown;
    exit: (code: number) => unknown;
};

/**
 * Owns the shutdown of a process. It listens once for SIGTERM and SIGINT, and returns
 * `subscribeShutdown`, with which every part of a service registers how to close itself.
 *
 * On the first signal the closers run in the reverse order of their subscription, one after
 * another and awaited: a part that was created later may use the parts created before it, so it
 * closes first. A closer that throws is reported with `reportError`, the rest still run, and the
 * process exits with 1 instead of 0. A second signal finds no listener and ends the process at once.
 */
export function createShutdownController(
    process: ShutdownProcess,
    reportError: (error: unknown) => void
): (close: () => unknown) => void {
    const closers: (() => unknown)[] = [];
    let isShuttingDown = false;

    async function shutdown(): Promise<void> {
        if (isShuttingDown) {
            return;
        }

        isShuttingDown = true;

        let exitCode = 0;

        for (const close of [...closers].reverse()) {
            try {
                await close();
            } catch (error) {
                reportError(error);
                exitCode = 1;
            }
        }

        process.exit(exitCode);
    }

    process.once('SIGTERM', () => {
        void shutdown();
    });
    process.once('SIGINT', () => {
        void shutdown();
    });

    return (close) => {
        closers.push(close);
    };
}
