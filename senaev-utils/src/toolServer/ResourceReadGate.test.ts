import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';

import {
    afterEach, expect, it, vi,
} from 'vitest';

import { ResourceReadGate } from './ResourceReadGate';

function response() {
    const result = new EventEmitter() as EventEmitter & { destroy: () => void };

    result.destroy = () => {
        result.emit('close');
    };

    return result as unknown as ServerResponse;
}

afterEach(() => vi.useRealTimers());

it('holds admission until both work and response finish, then admits another transfer', () => {
    const gate = new ResourceReadGate();
    const first = response();
    const transfer = gate.begin(first, 60_000);

    expect(transfer).not.toBeNull();
    transfer?.finish();
    expect(gate.begin(response(), 60_000)).toBeNull();
    first.emit('finish');
    const second = response();
    const next = gate.begin(second, 60_000);

    expect(next).not.toBeNull();
    second.emit('finish');
    expect(gate.begin(response(), 60_000)).toBeNull();
    next?.finish();
});

it('aborts disconnected work but holds admission until it actually stops', () => {
    const gate = new ResourceReadGate();
    const first = response();
    const transfer = gate.begin(first, 60_000);

    first.emit('close');
    expect(transfer?.signal.aborted).toBe(true);
    expect(gate.begin(response(), 60_000)).toBeNull();
    transfer?.finish();
    const second = response();
    const next = gate.begin(second, 60_000);

    expect(next).not.toBeNull();
    next?.finish();
    second.emit('finish');
});

it('times out stalled transfers and clears admission only after work stops', () => {
    vi.useFakeTimers();
    const gate = new ResourceReadGate();
    const first = response();
    const transfer = gate.begin(first, 100);

    vi.advanceTimersByTime(100);
    expect(transfer?.signal.aborted).toBe(true);
    expect(gate.begin(response(), 100)).toBeNull();
    transfer?.finish();
    expect(vi.getTimerCount()).toBe(0);
});
