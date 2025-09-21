import {
    describe,
    expect,
    it, vi,
} from 'vitest';

import { waitForFunction } from '../waitForFunction/waitForFunction';

import { runParallelTimescalesProcessing } from './runParallelTimescalesProcessing';

describe('runParallelTimescalesProcessing', () => {
    it('should work with one simple timescale', async () => {
        const callback = vi.fn();

        runParallelTimescalesProcessing<[{ time: number }]>({
            extractItemsFunctions: [
                () => Promise.resolve({
                    items: [
                        {
                            time: 1,
                            value: 1,
                        },
                        {
                            time: 2,
                            abc: 'def',
                        },
                        {
                            time: 3,
                        },
                    ],
                    isLast: true,
                }),
            ],
            callback,
            bufferSize: 1000,
        });

        await waitForFunction(() => callback.mock.calls.length > 2);

        expect(callback).toHaveBeenCalledTimes(3);
        expect(callback).toHaveBeenNthCalledWith(1, [
            {
                time: 1,
                value: 1,
            },
        ]);
        expect(callback).toHaveBeenNthCalledWith(2, [
            {
                time: 2,
                abc: 'def',
            },
        ]);
        expect(callback).toHaveBeenNthCalledWith(3, [
            {
                time: 3,
            },
        ]);
    });
});
