import { assertPositiveInteger, PositiveInteger } from '../../types/Number/PositiveInteger';
import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { RemoteDataProcessingWindowExtractItemsFunction } from '../createRemoteDataProcessingWindow/createRemoteDataProcessingWindow';
import { MinHeapUniqueNumber } from '../MinHeapUniqueNumber/MinHeapUniqueNumber';

type ObjectWithTime = {
    time: number;
};

type ExtractItemsFunctions<T extends ObjectWithTime[]> = {
    [K in keyof T]: RemoteDataProcessingWindowExtractItemsFunction<T[K]>;
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
    callback: (pointsInfo: ObjectsWithTimePortion<T>, time: ObjectWithTime['time']) => unknown;
    bufferSize: PositiveInteger;
}): Promise<void> {
    assertPositiveInteger(bufferSize, 'runParallelTimescalesProcessing bufferSize should be a positive integer');

    const timescalesCount = extractItemsFunctions.length;

    assertPositiveInteger(timescalesCount, 'runParallelTimescalesProcessing extractItemsFunctions should array should NOT be empty');

    const notFinishedBuffers: Set<UnsignedInteger> = new Set();
    const buffersToLoadData: UnsignedInteger[] = [];
    const buffers = extractItemsFunctions.map(<O extends ObjectWithTime>(_: RemoteDataProcessingWindowExtractItemsFunction<O>, i: UnsignedInteger) => {
        notFinishedBuffers.add(i);
        buffersToLoadData.push(i);

        const bufferInfo: TimescaleBufferInfo<O> = {
            array: [],
            index: 0,
            isLast: false,
        };

        return bufferInfo;
    }) as TimescalesBuffersInfo<T>;

    const minHeapUniqueNumber = new MinHeapUniqueNumber();

    while (true) {
        if (buffersToLoadData.length > 0) {
            await Promise.all(buffersToLoadData.map(async (index) => {
                const { items, isLast } = await extractItemsFunctions[index](bufferSize);

                if (isLast) {
                    buffers[index].isLast = true;
                }

                buffers[index].array = items;
                buffers[index].index = 0;

                if (items[0]) {
                    minHeapUniqueNumber.push(items[0].time);
                }
            }));

            buffersToLoadData.length = 0;
        }

        const minTime = minHeapUniqueNumber.pop();

        const portion = new Array(timescalesCount) as ObjectsWithTimePortion<T>;

        for (const i of notFinishedBuffers.values()) {
            const buffer = buffers[i];

            const item = buffer.array.at(buffer.index);

            if (item) {
                if (item.time === minTime) {
                    portion[i] = item;
                    buffer.index++;

                    const nextItem = buffer.array.at(buffer.index);

                    if (nextItem) {
                        minHeapUniqueNumber.push(nextItem.time);
                    } else if (!buffer.isLast) {
                        buffersToLoadData.push(i);
                    }
                }
            } else if (buffer.isLast) {
                notFinishedBuffers.delete(i);
            }
        }

        if (notFinishedBuffers.size === 0) {
            return;
        }

        callback(portion, minTime!);
    }
}
