import type { CommandExecution } from '../commands/CommandExecution';
import { CommandError } from '../commands/CommandError';

import { createLineStarts } from './textLines';

/** Maps a character offset to a 1-based line number. */
export function createLineLocator(content: string): (offset: number) => number {
    const lineStarts = createLineStarts(content);

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
function* occurrenceOffsets(content: string, text: string): Generator<number> {
    if (text.length === 0) {
        throw new CommandError('invalid_arguments', 'The "find" text must not be empty');
    }

    for (let offset = content.indexOf(text); offset !== -1; offset = content.indexOf(text, offset + text.length)) {
        yield offset;
    }
}

export function findOccurrences(content: string, text: string): number[] {
    return [...occurrenceOffsets(content, text)];
}

/**
 * Replaces `find`, which must occur exactly once. A model that copies text slightly wrong,
 * or too little of it, gets an error it can act on instead of an edit in the wrong place.
 *
 * @param documentName what the content is called in the error message, e.g. "note" or "file"
 */
function* replacementSteps(content: string, find: string, documentName: string): Generator<void, number> {
    const offsets: number[] = [];

    for (const offset of occurrenceOffsets(content, find)) {
        if (offsets.length % 1024 === 0) {
            yield;
        }

        offsets.push(offset);
    }

    if (offsets.length === 0) {
        throw new CommandError('not_found', `The "find" text does not occur in the ${documentName}; read the ${documentName} again and copy the text exactly`);
    }

    if (offsets.length > 1) {
        const lines: number[] = [];
        let cursor = 0;
        let line = 1;

        for (const offset of offsets) {
            if (lines.length % 1024 === 0) {
                yield;
            }

            for (let newline = content.indexOf('\n', cursor); newline !== -1 && newline < offset; newline = content.indexOf('\n', cursor)) {
                line++;
                cursor = newline + 1;
                if (line % 1024 === 0) {
                    yield;
                }
            }

            lines.push(line);
        }

        throw new CommandError('ambiguous', `The "find" text occurs ${offsets.length} times; include more surrounding text so it occurs once`, { lines });
    }

    return offsets[0] ?? 0;
}

function applyReplacement(content: string, find: string, replacement: string, offset: number): string {
    return `${content.slice(0, offset)}${replacement}${content.slice(offset + find.length)}`;
}

export function replaceExactlyOnce(content: string, find: string, replacement: string, documentName: string): string {
    const steps = replacementSteps(content, find, documentName);
    let step = steps.next();

    while (!step.done) {
        step = steps.next();
    }

    return applyReplacement(content, find, replacement, step.value);
}

/** Same replacement algorithm, yielding so cancellation can be observed. */
export async function replaceExactlyOnceAsync(content: string, find: string, replacement: string, options: { documentName?: string; execution: CommandExecution }): Promise<string> {
    const documentName = options.documentName ?? 'file';
    const { execution } = options;

    execution.throwIfAborted();
    const steps = replacementSteps(content, find, documentName);
    let step = steps.next();

    while (!step.done) {
        await execution.checkpoint();
        step = steps.next();
    }

    await execution.checkpoint();

    return applyReplacement(content, find, replacement, step.value);
}
