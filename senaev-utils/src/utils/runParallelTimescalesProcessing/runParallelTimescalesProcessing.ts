import { PositiveInteger } from '../../types/Number/PositiveInteger';
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
    isFinished: boolean;
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
    const timescalesCount = extractItemsFunctions.length;
    const buffers = extractItemsFunctions.map(<O extends ObjectWithTime>() => {
        const bufferInfo: TimescaleBufferInfo<O> = {
            array: [],
            index: 0,
            isFinished: false,
        };

        return bufferInfo;
    }) as TimescalesBuffersInfo<T>;

    while (true) {
        const portion = new Array(timescalesCount) as ObjectsWithTimePortion<T>;
        const traversedBuffers: UnsignedInteger[] = [];
        let allFinished = true;
        let hasPortion = false;

        for (let i = 0; i < timescalesCount; i++) {
            const buffer = buffers[i];

            const item = buffer.array.at(buffer.index);

            if (item || !buffer.isFinished) {
                allFinished = false;
            }

            if (item) {
                portion[i] = item;
                buffer.index++;
                hasPortion = true;
            } else {
                if (!buffer.isFinished) {
                    traversedBuffers.push(i);
                }
            }
        }

        if (hasPortion) {
            callback(portion);
        }

        if (allFinished) {
            return;
        }

        if (traversedBuffers.length > 0) {
            await promiseAll(traversedBuffers.map(async (index) => {
                const lastItem = buffers[index].array.at(-1);

                const { items, isLast } = await extractItemsFunctions[index]({
                    lastItem,
                    count: bufferSize,
                });

                if (isLast) {
                    buffers[index].isFinished = true;
                }

                buffers[index].array = items;
                buffers[index].index = 0;
            }));
        }
    }
}
