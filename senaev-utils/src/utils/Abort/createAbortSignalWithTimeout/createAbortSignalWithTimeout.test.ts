import {
    afterEach, expect, it, vi,
} from 'vitest';

import { createAbortSignalWithTimeout } from './createAbortSignalWithTimeout';

afterEach(() => {
    vi.restoreAllMocks();
});

// AbortSignal.timeout does not use the timers that fake timers replace, so the test controls it directly.
function controlTimeoutSignal() {
    const timeout = new AbortController();
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);

    return {
        spy,
        timeout,
    };
}

it('aborts when the timeout passes, with or without a signal of the caller', () => {
    const { spy, timeout } = controlTimeoutSignal();
    const alone = createAbortSignalWithTimeout(1_000);
    const withCaller = createAbortSignalWithTimeout(1_000, new AbortController().signal);

    expect(spy).toHaveBeenCalledWith(1_000);
    expect(alone.aborted).toBe(false);
    expect(withCaller.aborted).toBe(false);

    timeout.abort(new Error('timeout'));

    expect(alone.aborted).toBe(true);
    expect(withCaller.aborted).toBe(true);
});

it('aborts with the reason of the caller before the timeout', () => {
    const { timeout } = controlTimeoutSignal();
    const caller = new AbortController();
    const signal = createAbortSignalWithTimeout(1_000, caller.signal);
    const reason = new Error('cancelled by the caller');

    caller.abort(reason);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
    expect(timeout.signal.aborted).toBe(false);
});

it('is already aborted when the signal of the caller is', () => {
    controlTimeoutSignal();
    const caller = new AbortController();

    caller.abort();

    expect(createAbortSignalWithTimeout(1_000, caller.signal).aborted).toBe(true);
});
