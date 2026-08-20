type Range = [number, number];

export function excludeRanges(initialRange: Range, sortedRangesToExclude: Range[]): Range[] {
    const [
        start,
        end,
    ] = initialRange;

    const result: Range[] = [];
    let currentNumber = start;

    for (const [
        meetingStart,
        meetingEnd,
    ] of sortedRangesToExclude) {
        if (meetingStart >= end) {
            break;
        }

        if (meetingEnd <= start) {
            continue;
        }

        if (meetingStart > currentNumber) {
            result.push([
                currentNumber,
                meetingStart,
            ]);
        }

        currentNumber = Math.max(currentNumber, meetingEnd);
    }

    if (currentNumber < end) {
        result.push([
            currentNumber,
            end,
        ]);
    }

    return result;
}
