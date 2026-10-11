import { createTwoFilesPatch } from 'diff';

export const FILE_DIFF_OPTIONS = {
    maxDiffChars: 20_000,
    contextLines: 3,
};

export type FileDiff = {
    diff: string;
    diffTruncated: boolean;
};

/** Pure formatting core, also serialized into the disposable diff worker. No closures. */
export function buildFileDiff(
    createPatch: typeof createTwoFilesPatch,
    input: { path: string; before: string; after: string },
    options: typeof FILE_DIFF_OPTIONS
): FileDiff {
    const {
        path, before, after,
    } = input;
    const patch = createPatch(`a/${path}`, `b/${path}`, before, after, undefined, undefined, { context: options.contextLines })
        .replace(/^=+\n/, '');

    return {
        diff: patch.slice(0, options.maxDiffChars),
        diffTruncated: patch.length > options.maxDiffChars,
    };
}

/** The unified diff of a whole file. `before` is empty for a new file. */
export function createFileDiff(path: string, before: string, after: string): FileDiff {
    return buildFileDiff(createTwoFilesPatch, {
        path,
        before,
        after,
    }, FILE_DIFF_OPTIONS);
}
