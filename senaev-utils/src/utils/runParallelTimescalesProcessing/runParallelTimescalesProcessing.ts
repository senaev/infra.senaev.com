import { assertPositiveInteger, PositiveInteger } from '../../types/Number/PositiveInteger';
import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { RemoteDataProcessingWindowLoadNextItemsFunction } from '../createRemoteDataProcessingWindow/createRemoteDataProcessingWindow';
import { promiseAll } from '../Promise/promiseAll/promiseAll';

type ObjectWithTime = {
    time: number;
};

type ExtractItemsFunctions<T extends ObjectWithTime[]> = {
    [K in keyof T]: RemoteDataProcessingWindowLoadNextItemsFunction<T[K]>;
};

type ObjectsWithTimePortion<T extends ObjectWithTime[]> = {
    [K in keyof T]: T[K] | undefined;
};

type TimescaleBufferInfo<T extends ObjectWithTime> = {
    array: T[];
    index: UnsignedInteger;
    isLast: boolean;
};

type TimescalesBuffersInfo<T extends ObjectWithTime[]> = {
    [K in keyof T]: TimescaleBufferInfo<T[K]>;
};

export async function runParallelTimescalesProcessing<T extends ObjectWithTime[]>({
    extractItemsFunctions,
    callback,
    bufferSize,
}: {
    extractItemsFunctions: ExtractItemsFunctions<T>;
    callback: (args: ObjectsWithTimePortion<T>) => unknown;
    bufferSize: PositiveInteger;
}): Promise<void> {
    assertPositiveInteger(bufferSize, 'runParallelTimescalesProcessing bufferSize should be a positive integer');

    const timescalesCount = extractItemsFunctions.length;

    assertPositiveInteger(timescalesCount, 'runParallelTimescalesProcessing extractItemsFunctions should array should NOT be empty');

    const buffers = extractItemsFunctions.map(<O extends ObjectWithTime>() => {
        const bufferInfo: TimescaleBufferInfo<O> = {
            array: [],
            index: 0,
            isLast: false,
        };

        return bufferInfo;
    }) as TimescalesBuffersInfo<T>;

    while (true) {
        // Check if all buffers are finished
        let allFinished = true;

        for (let i = 0; i < timescalesCount; i++) {
            const buffer = buffers[i];

            const item = buffer.array.at(buffer.index);

            if (item || !buffer.isLast) {
                allFinished = false;
            }
        }

        if (allFinished) {
            return;
        }

        // Look for buffers that have to load items
        const traversedBuffers: UnsignedInteger[] = [];

        for (let i = 0; i < timescalesCount; i++) {
            const buffer = buffers[i];
            const item = buffer.array.at(buffer.index);

            if (!item) {
                if (!buffer.isLast) {
                    traversedBuffers.push(i);
                }
            }
        }

        // Load items for buffers that have to load items
        if (traversedBuffers.length > 0) {
            await promiseAll(traversedBuffers.map(async (index) => {
                const lastItem = buffers[index].array.at(-1);

                const { items, isLast } = await extractItemsFunctions[index]({
                    lastItem,
                    count: bufferSize,
                });

                if (isLast) {
                    buffers[index].isLast = true;
                }

                buffers[index].array = items;
                buffers[index].index = 0;
            }));
        }

        // Find the minimum time of the buffers that are not finished
        let minTime = Infinity;

        for (let i = 0; i < timescalesCount; i++) {
            const buffer = buffers[i];

            const item = buffer.array.at(buffer.index);

            if (item) {
                minTime = Math.min(minTime, item.time);
            }
        }

        // Create a portion of data
        let hasPortion = false;
        const portion = new Array(timescalesCount) as ObjectsWithTimePortion<T>;

        for (let i = 0; i < timescalesCount; i++) {
            const buffer = buffers[i];

            const item = buffer.array.at(buffer.index);

            if (item) {
                if (item.time === minTime) {
                    portion[i] = item;
                    buffer.index++;
                    hasPortion = true;
                }
            }
        }

        if (hasPortion) {
            callback(portion);
        }
    }
}
