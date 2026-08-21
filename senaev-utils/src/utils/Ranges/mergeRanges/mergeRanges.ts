type Range = [number, number];

export function mergeRanges(ranges: Range[]): Range[] {
    if (!ranges.length) {
        return [];
    }

    const stack: Range[] = [];

    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);

    // `ranges` is non-empty (checked above), so `sorted` has a first element and
    // every `sorted[i]` below `sorted.length` is present.
    const firstRange = sorted[0]!;

    stack.push([
        firstRange[0],
        firstRange[1],
    ]);

    for (let i = 1; i < sorted.length; i++) {
        const range = sorted[i]!;
        const lastRange = stack.at(-1)!;

        if (lastRange[1] < range[0]) {
            stack.push([
                range[0],
                range[1],
            ]);
        } else if (lastRange[1] < range[1]) {
            lastRange[1] = range[1];
        }
    }

    return stack;
}
