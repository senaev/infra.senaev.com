import {
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

import { createSimultaneousOperationsHandler, SimultaneousOperationsHandlerParams } from './createSimultaneousOperationsHandler';

describe('createSimultaneousOperationsHandler', () => {
    it('should handle single operation', async () => {
        const callback = vi.fn((callsArguments) => callsArguments.map((arg: SimultaneousOperationsHandlerParams<string>) => JSON.stringify(arg)).join(','));
        const handler = createSimultaneousOperationsHandler<string, string>(callback);

        const promise = handler('test', 0);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith([
            {
                index: 0,
                param: 'test',
            },
        ]);

        const result = await promise;
        expect(result).toEqual({
            paramsList: [
                {
                    index: 0,
                    param: 'test',
                },
            ],
            result: '{"index":0,"param":"test"}',
        });
    });

    it('should handle multiple sequential operations', async () => {
        const callback = vi.fn();
        const handler = createSimultaneousOperationsHandler<string, void>(callback);

        const promises = [
            handler('first', 0),
            handler('second', 1),
            handler('third', 2),
        ];

        expect(callback).toHaveBeenCalledTimes(3);
        expect(callback).toHaveBeenNthCalledWith(1, [
            {
                index: 0,
                param: 'first',
            },
        ]);
        expect(callback).toHaveBeenNthCalledWith(2, [
            {
                index: 1,
                param: 'second',
            },
        ]);
        expect(callback).toHaveBeenNthCalledWith(3, [
            {
                index: 2,
                param: 'third',
            },
        ]);

        const results = await Promise.all(promises);
        expect(results).toEqual([
            {
                paramsList: [
                    {
                        index: 0,
                        param: 'first',
                    },
                ],
                result: undefined,
            },
            {
                paramsList: [
                    {
                        index: 1,
                        param: 'second',
                    },
                ],
                result: undefined,
            },
            {
                paramsList: [
                    {
                        index: 2,
                        param: 'third',
                    },
                ],
                result: undefined,
            },
        ]);
    });

    it('should skip sequential operations with same index', async () => {
        const callback = vi.fn();
        const handler = createSimultaneousOperationsHandler<string, void>(callback);

        const promise1 = handler('test1', 0);
        const promise2 = handler('test2', 1);
        const promise3 = handler('test3', 0);

        const results = await Promise.all([
            promise1,
            promise2,
            Promise.race([
                promise3.then(() => {
                    throw new Error('This promise should not be resolved');
                }),
                promiseTimeout(10).then(() => 'success timeout'),
            ]),
        ]);

        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenCalledWith([
            {
                index: 0,
                param: 'test1',
            },
        ]);
        expect(results).toEqual([
            {
                paramsList: [
                    {
                        index: 0,
                        param: 'test1',
                    },
                ],
                result: undefined,
            },
            {
                paramsList: [
                    {
                        index: 1,
                        param: 'test2',
                    },
                ],
                result: undefined,
            },
            'success timeout',
        ]);
    });

    it('should wait for operations with lower indices', async () => {
        const callback = vi.fn();
        const handler = createSimultaneousOperationsHandler<number, void>(callback);

        // Start with index 1 (should wait)
        const promise1 = handler(1, 1);

        // Small delay to ensure operations are queued in the right order
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Then add index 0 (should trigger both)
        const promise0 = handler(0, 0);

        const results = await Promise.all([
            promise0,
            promise1,
        ]);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith([
            {
                index: 0,
                param: 0,
            },
            {
                index: 1,
                param: 1,
            },
        ]);

        const expectedResult = {
            paramsList: [
                {
                    index: 0,
                    param: 0,
                },
                {
                    index: 1,
                    param: 1,
                },
            ],
            result: undefined,
        };
        expect(results).toEqual([
            expectedResult,
            expectedResult,
        ]);
    });

    it('should handle out of order operations', async () => {
        const callback = vi.fn();
        const handler = createSimultaneousOperationsHandler<number, void>(callback);

        const promise2 = handler(2, 2);
        const promise0 = handler(0, 0);
        const promise1 = handler(1, 1);

        const results = await Promise.all([
            promise0,
            promise1,
            promise2,
        ]);

        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenNthCalledWith(1, [
            {
                index: 0,
                param: 0,
            },
        ]);
        expect(callback).toHaveBeenNthCalledWith(2, [
            {
                index: 1,
                param: 1,
            },
            {
                index: 2,
                param: 2,
            },
        ]);

        const expectedResult2 = {
            paramsList: [
                {
                    index: 1,
                    param: 1,
                },
                {
                    index: 2,
                    param: 2,
                },
            ],
            result: undefined,
        };
        expect(results).toEqual([
            {
                paramsList: [
                    {
                        index: 0,
                        param: 0,
                    },
                ],
                result: undefined,
            },
            expectedResult2,
            expectedResult2,
        ]);
    });

    it('handle operations result', async () => {
        const callback = vi.fn((argsList) => argsList.map((arg: SimultaneousOperationsHandlerParams<number>) => `string-${arg.index}-${arg.param}`).join(','));
        const handler = createSimultaneousOperationsHandler<number, string>(callback);

        const promise3 = handler(1, 3);
        await promiseTimeout(10);
        const promise2 = handler(1, 2);
        await promiseTimeout(10);
        const promise1 = handler(1, 1);
        await promiseTimeout(10);

        let throwErrorIfResolved = true;
        await Promise.race([
            promise3.then(() => {
                if (throwErrorIfResolved) {
                    throw new Error('This promise should not be resolved');
                }
            }),
            promise2.then(() => {
                if (throwErrorIfResolved) {
                    throw new Error('This promise should not be resolved');
                }
            }),
            promise1.then(() => {
                if (throwErrorIfResolved) {
                    throw new Error('This promise should not be resolved');
                }
            }),
            promiseTimeout(10).then(() => 'timeout'),
        ]);

        throwErrorIfResolved = false;

        const promise0 = handler(1, 0);
        const results = await Promise.all([
            promise0,
            promise1,
            promise2,
            promise3,
        ]);

        const expectedResult = 'string-0-1,string-1-1,string-2-1,string-3-1';
        const expectedCallbackCalls = {
            paramsList: [

                {
                    index: 0,
                    param: 1,
                },
                {
                    index: 1,
                    param: 1,
                },
                {
                    index: 2,
                    param: 1,
                },
                {
                    index: 3,
                    param: 1,
                },
            ],
            result: expectedResult,

        };

        expect(results).toEqual([
            expectedCallbackCalls,
            expectedCallbackCalls,
            expectedCallbackCalls,
            expectedCallbackCalls,
        ]);

        handler(1, 4);
        const promise5 = handler(1, 5);

        const result5 = await promise5;

        expect(result5).toEqual({
            paramsList: [
                {
                    index: 5,
                    param: 1,
                },
            ],
            result: 'string-5-1',
        });
    });
});
