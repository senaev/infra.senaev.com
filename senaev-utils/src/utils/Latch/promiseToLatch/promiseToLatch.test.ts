import {
    describe,
    expect,
    test,
    vi,
} from 'vitest';

import { promiseToLatch } from './promiseToLatch';

describe('promiseToLatch', () => {
    test('should not dispatch while promise is pending', () => {
        const latch = promiseToLatch(new Promise(() => {}));

        expect(latch.isDispatched()).to.equal(false);
        expect(latch.getValue()).to.equal(undefined);
    });

    test('should dispatch data on resolve', async () => {
        const spy = vi.fn();
        const latch = promiseToLatch(Promise.resolve(111));

        latch.subscribe(spy);

        await vi.waitFor(() => {
            expect(latch.isDispatched()).to.equal(true);
        });

        expect(latch.getValue()).toEqual({ data: 111 });
        expect(spy.mock.calls).toEqual([[{ data: 111 }]]);
    });

    test('should dispatch error on reject', async () => {
        const error = new Error('nope');
        const spy = vi.fn();
        const latch = promiseToLatch(Promise.reject(error));

        latch.subscribe(spy);

        await vi.waitFor(() => {
            expect(latch.isDispatched()).to.equal(true);
        });

        expect(latch.getValue()).toEqual({ error });
        expect(spy.mock.calls).toEqual([[{ error }]]);
    });

    test('should call late subscribers immediately with settled value', async () => {
        const latch = promiseToLatch(Promise.resolve('done'));

        await vi.waitFor(() => {
            expect(latch.isDispatched()).to.equal(true);
        });

        const spy = vi.fn();

        latch.subscribe(spy);

        expect(spy.mock.calls).toEqual([[{ data: 'done' }]]);
    });
});
