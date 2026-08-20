type Range = [number, number];

export function isRangeWithinRanges(range: Range, ranges: Range[]) {
    for (const [
        start,
        end,
    ] of ranges) {
        if (start <= range[0] && range[1] <= end) {
            return true;
        }
    }

    return false;
}
