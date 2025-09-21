import { PositiveInteger } from '../../types/Number/PositiveInteger';
import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { RemoteDataProcessingWindowLoadNextItemsFunction } from '../createRemoteDataProcessingWindow/createRemoteDataProcessingWindow';
import { MinHeapUniqueNumber } from '../MinHeapUniqueNumber/MinHeapUniqueNumber';
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
    isFinished: boolean;
};

type TimescalesBuffersInfo<T extends ObjectWithTime[]> = {
    [K in keyof T]: TimescaleBufferInfo<T[K]>;
};

export function runParallelTimescalesProcessing<T extends ObjectWithTime[]>({
    extractItemsFunctions,
    callback,
    bufferSize,
}: {
    extractItemsFunctions: ExtractItemsFunctions<T>;
    callback: (args: ObjectsWithTimePortion<T>) => unknown;
    bufferSize: PositiveInteger;
}): void {
    const timescalesCount = extractItemsFunctions.length;
    const buffers = extractItemsFunctions.map(<O extends ObjectWithTime>() => {
        const bufferInfo: TimescaleBufferInfo<O> = {
            array: [],
            index: 0,
            isFinished: false,
        };

        return bufferInfo;
    }) as TimescalesBuffersInfo<T>;

    // undefined if timescale is finished
    const timesMinHeap = new MinHeapUniqueNumber();

    async function startProcessing() {
        while (true) {
            const portion = new Array(timescalesCount) as ObjectsWithTimePortion<T>;
            const minTime = timesMinHeap.pop();

            if (minTime === undefined) {
                break;
            }

            const traversedArraysIndexes: UnsignedInteger[] = [];

            for (let i = 0; i < timescalesCount; i++) {
                const buffer = buffers[i];
                const {
                    array, index,
                } = buffer;
                const { time } = array[index];

                if (time === minTime) {
                    portion[i] = array[index];

                    const nextIndex = index + 1;

                    buffer.index = nextIndex;

                    const nextValue = buffer.array[nextIndex];

                    if (nextValue) {
                        timesMinHeap.push(nextValue.time);
                    } else {
                        if (buffer.isFinished) {
                            buffer.array = [];
                            buffer.index = 0;
                        } else {
                            traversedArraysIndexes.push(i);
                        }
                    }
                }
            }

            callback(portion);

            await promiseAll(traversedArraysIndexes.map(async (index) => {
                const lastItem = buffers[index].array.at(-1);

                const { items, isLast } = await extractItemsFunctions[index]({
                    lastItem,
                    count: bufferSize,
                });

                buffers[index].array = items;
                buffers[index].index = 0;

                if (isLast) {
                    buffers[index].isFinished = true;
                }
            }));
        }
    }

    promiseAll(extractItemsFunctions.map((extractItemsFunction) => extractItemsFunction({
        lastItem: undefined,
        count: bufferSize,
    })))
        .then((firstTimescalesData) => {
            firstTimescalesData.forEach(({ items, isLast }, index) => {
                if (isLast) {
                    buffers[index].isFinished = true;
                }

                buffers[index].array = items;

                const firstItem = items.at(0);

                if (firstItem) {
                    timesMinHeap.push(firstItem.time);
                }
            });

            startProcessing();
        });
}
