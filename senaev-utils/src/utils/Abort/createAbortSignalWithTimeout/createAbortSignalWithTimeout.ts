/** Aborts when `timeoutMs` passes, or earlier when the optional `signal` of the caller aborts. */
export function createAbortSignalWithTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
    return signal
        ? AbortSignal.any([
            signal,
            AbortSignal.timeout(timeoutMs),
        ])
        : AbortSignal.timeout(timeoutMs);
}
