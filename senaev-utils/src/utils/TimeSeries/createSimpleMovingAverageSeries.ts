import { mean } from 'simple-statistics';

import { PositiveInteger } from '../Number/PositiveInteger';

export function createSimpleMovingAverageSeries({
    series,
    windowSize,
}: {
    series: number[];
    windowSize: PositiveInteger;
}): (number | undefined)[] {
    const movingAverageData: (number | undefined)[] = [];

    for (let i = 0; i < series.length; i++) {
        if (i < windowSize - 1) {
            movingAverageData.push(undefined);
        } else {
            movingAverageData.push(mean(series.slice(i - windowSize + 1, i + 1)));
        }
    }

    return movingAverageData;
}
