import {
    describe,
    expect,
    test,
} from 'vitest';

import { promiseTimeout } from '../../timers/promiseTimeout/promiseTimeout';

import { throttleWithPromiseFunction } from './throttleWithPromiseFunction';

describe('throttleWithPromiseFunction', () => {
    test('should not call callback before promise resolve', async () => {
        const resolvers: {
            promise: Promise<void>;
            resolve: VoidFunction;
            isResolved: () => boolean;
        }[] = [];
        let callCount = 0;

        const promiseThrottleFunction = () => {
            let resolve: VoidFunction;
            let isResolved = false;
            const promise = new Promise<void>((res) => {
                resolve = () => {
                    res();
                    isResolved = true;
                };
            });

            resolvers.push({
                promise,
                resolve: resolve!,
                isResolved: () => isResolved,
            });

            return promise;
        };

        const throttled = throttleWithPromiseFunction(() => {
            callCount++;
        }, promiseThrottleFunction);

        expect(callCount).toBe(0);

        throttled();
        expect(resolvers.length).toBe(1);

        expect(callCount).toBe(0);

        await promiseTimeout(0);

        expect(callCount).toBe(0);
        expect(resolvers[0].isResolved()).toBe(false);

        throttled();
        throttled();
        throttled();
        expect(resolvers.length).toBe(1);

        resolvers[0].resolve();
        throttled();
        await resolvers[0].promise;

        expect(callCount).toBe(1);
        expect(resolvers[0].isResolved()).toBe(true);
        expect(resolvers.length).toBe(1);

        throttled();
        expect(callCount).toBe(1);
        expect(resolvers.length).toBe(2);
        expect(resolvers[1].isResolved()).toBe(false);

        resolvers[1].resolve();
        throttled();
        throttled();
        throttled();
        throttled();
        await resolvers[1].promise;

        expect(callCount).toBe(2);
        expect(resolvers[1].isResolved()).toBe(true);
        expect(resolvers.length).toBe(2);
    });
});
