import {
    describe, expect, it,
} from 'vitest';

import { httpRateLimit } from './httpRateLimit';

describe('httpRateLimit', () => {
    it('uses the production threshold and independent route keys', () => {
        const login = httpRateLimit('login').config.rateLimit;
        const token = httpRateLimit('token').config.rateLimit;

        expect(login.max).toBe(60);
        expect(login.timeWindow).toBe('1 minute');
        expect(login.keyGenerator()).toBe('login');
        expect(token.keyGenerator()).toBe('token');
    });

    it('supports a controlled threshold and window', () => {
        const limit = httpRateLimit('test', {
            max: 2,
            timeWindow: 1000,
        }).config.rateLimit;

        expect(limit.max).toBe(2);
        expect(limit.timeWindow).toBe(1000);
    });
});
