import {
    describe,
    expect,
    it,
} from 'vitest';

import { tryCatch } from './tryCatch';

describe('tryCatch', () => {
    it('should execute valid function', () => {
        let x = 1;

        tryCatch(() => x++);
        expect(x).to.eql(2);
    });

    it('should execute onError callback', () => {
        let error;
        const result = tryCatch(
            () => {
                throw new Error('fn throws an error');
            },
            (e) => {
                error = e;
            }
        );

        expect(result === undefined).to.eql(true);
        expect(error !== undefined).to.eql(true);
    });

    it('should infer valid return type', () => {
        const fn = (): number => 10;

        expect(tryCatch(fn)! > 0).to.eql(true);
    });
});
