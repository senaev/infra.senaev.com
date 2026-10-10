import { ToolError } from './ToolError';

/** Maps a character offset to a 1-based line number. */
export function createLineLocator(content: string): (offset: number) => number {
    const lineStarts = [0];

    for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
        lineStarts.push(index + 1);
    }

    return (offset) => {
        let low = 0;
        let high = lineStarts.length - 1;

        while (low < high) {
            const middle = Math.ceil((low + high) / 2);

            if ((lineStarts[middle] ?? 0) <= offset) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return low + 1;
    };
}

/** The offsets of every non-overlapping occurrence of `text`. */
export function findOccurrences(content: string, text: string): number[] {
    const offsets: number[] = [];

    for (let offset = content.indexOf(text); offset !== -1; offset = content.indexOf(text, offset + text.length)) {
        offsets.push(offset);
    }

    return offsets;
}

/**
 * Replaces `find`, which must occur exactly once. A model that copies text slightly wrong,
 * or too little of it, gets an error it can act on instead of an edit in the wrong place.
 *
 * @param documentName what the content is called in the error message, e.g. "note" or "file"
 */
export function replaceExactlyOnce(content: string, find: string, replacement: string, documentName: string): string {
    const occurrences = findOccurrences(content, find);

    if (occurrences.length === 0) {
        throw new ToolError('not_found', `The "find" text does not occur in the ${documentName}; read the ${documentName} again and copy the text exactly`);
    }

    if (occurrences.length > 1) {
        const lineOf = createLineLocator(content);

        throw new ToolError('ambiguous', `The "find" text occurs ${occurrences.length} times; include more surrounding text so it occurs once`, {
            lines: occurrences.map(lineOf),
        });
    }

    const offset = occurrences[0] ?? 0;

    return `${content.slice(0, offset)}${replacement}${content.slice(offset + find.length)}`;
}
