import {
    beforeEach,
    describe,
    expect,
    Mock,
    test,
    vi,
} from 'vitest';

import { once } from './once';

describe('function', () => {
    describe('once', () => {
        let fn: Mock;

        beforeEach(() => {
            fn = vi.fn((x, y) => x + y);
        });

        test('should be called once', () => {
            const onceFn = once(fn);

            expect(fn.mock.calls.length).toEqual(0);

            onceFn();
            expect(fn.mock.calls.length).toEqual(1);

            onceFn();
            expect(fn.mock.calls.length).toEqual(1);

            onceFn();
            expect(fn.mock.calls.length).toEqual(1);
        });

        test('should return the same result on the rest calls', () => {
            const onceFn = once(fn);

            expect(fn.mock.calls.length).toEqual(0);

            const result: number = onceFn(1, 2);
            expect(result).to.eql(3);

            const nextResult: number = onceFn(4, 5);
            expect(nextResult).to.eql(3);

            expect(fn.mock.calls.length).toEqual(1);
        });

        test('save context', () => {
            const randomNumber = Math.random();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const randomNumberFromContext: number = once(function (this: any) {
                return this;
            }).apply(randomNumber);

            expect(randomNumberFromContext).to.eql(randomNumber);
        });

        test('generic should work', () => {
            type Func<T> = (variable: T) => T;
            const func: Func<{
                x: number;
                y: string;
                z: {
                    a: boolean;
                    b: null;
                };
            }> = (obj) => obj;

            const result = once(func)({
                x: 1,
                y: '2',
                z: {
                    a: true,
                    b: null,
                },
            });

            // typescript passes type through generic
            expect(result.z.a).to.eql(true);
        });

        test('should correctly handle recursion', () => {
            let callsCount = 0;
            const func = once(() => {
                func();

                callsCount++;
                return 123;
            });

            const result = func();

            expect(callsCount).to.equal(1);
            expect(result).to.equal(123);
        });
    });
});
