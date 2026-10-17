import { parseTaskLine, type TaskLineParseResult } from 'senaev-utils/src/obsidianTasks/taskLine';

import { findRawBlocks, isLineInRawBlock } from '../markdown/rawBlocks';

export type TaskLine = {
    /** 1-based. */
    line: number;
    raw: string;
    parsed: TaskLineParseResult;
};

/** A cheap test before the Markdown parse, which most notes without tasks can skip. */
const MAYBE_TASK = /^[\s>]*(?:[-*+]|\d+[.)]) +\[.\]/mu;

/**
 * Every task line of a note, as the Tasks plugin finds them: lines in frontmatter, code
 * and HTML blocks are not tasks.
 */
export function findTaskLines(content: string): TaskLine[] {
    if (!MAYBE_TASK.test(content)) {
        return [];
    }

    const rawBlocks = findRawBlocks(content);
    const result: TaskLine[] = [];

    for (const [
        index,
        raw,
    ] of content.split('\n').entries()) {
        const parsed = parseTaskLine(raw);

        if (parsed !== null && !isLineInRawBlock(rawBlocks, index + 1)) {
            result.push({
                line: index + 1,
                raw,
                parsed,
            });
        }
    }

    return result;
}
