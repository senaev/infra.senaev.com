import {
    describe, expect, it, vi,
} from 'vitest';

import type { LoginSession } from './login';
import { createPendingLoginSlot } from './pendingLogin';

function login() {
    const session: LoginSession = {
        authorizationUrl: Promise.resolve('https://example.com'),
        submitCode: vi.fn(),
        cancel: vi.fn(),
    };

    return {
        session,
        report: vi.fn(() => Promise.resolve()),
        onCancel: vi.fn(),
    };
}

describe('the pending login slot', () => {
    it('stops the waiting login when another one begins', () => {
        const slot = createPendingLoginSlot();
        const first = login();
        const second = login();

        slot.begin(first);
        slot.begin(second);

        expect(first.session.cancel).toHaveBeenCalledOnce();
        expect(first.onCancel).toHaveBeenCalledOnce();
        expect(slot.current()).toBe(second);
    });

    it('hands the waiting login over once, without stopping it', () => {
        const slot = createPendingLoginSlot();
        const waiting = login();

        slot.begin(waiting);

        expect(slot.take()).toBe(waiting);
        expect(slot.take()).toBeNull();
        expect(waiting.session.cancel).not.toHaveBeenCalled();
    });

    it('stops a given session only while it still waits', () => {
        const slot = createPendingLoginSlot();
        const first = login();
        const second = login();

        slot.begin(first);
        slot.begin(second);
        slot.cancel(first.session);

        expect(second.session.cancel).not.toHaveBeenCalled();
        expect(slot.current()).toBe(second);

        slot.cancel(second.session);

        expect(second.session.cancel).toHaveBeenCalledOnce();
        expect(slot.current()).toBeNull();
    });
});
