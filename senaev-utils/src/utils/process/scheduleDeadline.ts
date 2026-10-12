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
