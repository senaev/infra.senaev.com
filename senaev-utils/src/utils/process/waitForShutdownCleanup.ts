const SHUTDOWN_GRACE_MS = 10_000;

/** Wait up to ten seconds for cleanup before rejecting. */
export async function waitForShutdownCleanup(cleanup: Promise<unknown>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Service cleanup exceeded shutdown grace')), SHUTDOWN_GRACE_MS);
        timer.unref();
    });

    try {
        await Promise.race([
            cleanup,
            deadline,
        ]);
    } finally {
        clearTimeout(timer);
    }
}
