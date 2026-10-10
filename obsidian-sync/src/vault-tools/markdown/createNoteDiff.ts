import { createTwoFilesPatch } from 'diff';

const MAX_DIFF_CHARS = 20_000;
const CONTEXT_LINES = 3;

export type NoteDiff = {
    diff: string;
    diffTruncated: boolean;
};

/**
 * The unified diff of a whole note, frontmatter included, so the user sees exactly what a
 * write changed on disk. `before` is `''` for a new note.
 */
export function createNoteDiff(path: string, before: string, after: string): NoteDiff {
    const patch = createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after, undefined, undefined, { context: CONTEXT_LINES })
        // jsdiff starts every patch with a line of "=" signs, which is noise in a chat.
        .replace(/^=+\n/, '');

    return patch.length > MAX_DIFF_CHARS
        ? {
            diff: patch.slice(0, MAX_DIFF_CHARS),
            diffTruncated: true,
        }
        : {
            diff: patch,
            diffTruncated: false,
        };
}
