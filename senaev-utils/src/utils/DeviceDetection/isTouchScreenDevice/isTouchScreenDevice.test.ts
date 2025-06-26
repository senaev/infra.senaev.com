import {
    describe,
    expect,
    it,
} from 'vitest';

import { isTouchScreenDevice } from './isTouchScreenDevice';

describe('isTouchScreenDevice', () => {
    // остальные кейсы с моками покрыты в дочерних утилитах
    it('returns false with current window', () => {
        // В Jest используется кастомный testEnvironment c jsdom, см. custom-test-env.ts
        expect(isTouchScreenDevice({})).to.eql(false);
    });
});
