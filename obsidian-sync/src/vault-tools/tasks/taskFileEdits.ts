import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { parseTaskLine } from 'senaev-utils/src/obsidianTasks/taskLine';

import { findRawBlocks, type RawBlockKind } from '../markdown/rawBlocks';

import { toVaultTask, type VaultTask } from './scanVaultTasks';

const RAW_BLOCK_NAMES: Record<RawBlockKind, string> = {
    yaml: 'the frontmatter',
    code: 'a code block',
    html: 'an HTML block',
    table: 'a table',
};

/** The number of lines; a final newline does not start another line. */
export function countLines(content: string): number {
    if (content === '') {
        return 0;
    }

    return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

/**
 * Refuses an insert after `afterLine` that would land inside a block where a task line is
 * not a task, or before the frontmatter, which must stay the first thing in the note.
 */
export function assertTaskInsertPosition(content: string, afterLine: number): void {
    const lineCount = countLines(content);

    if (afterLine > lineCount) {
        throw new CommandError('invalid_arguments', `"afterLine" ${afterLine} does not exist: the note has ${lineCount} lines`);
    }

    for (const block of findRawBlocks(content)) {
        const isInside = block.startLine <= afterLine && afterLine < block.endLine;
        const isBeforeFrontmatter = block.kind === 'yaml' && afterLine < block.startLine;

        if (isInside || isBeforeFrontmatter) {
            throw new CommandError(
                'invalid_arguments',
                `A task cannot be inserted after line ${afterLine}: it is inside ${RAW_BLOCK_NAMES[block.kind]} (lines ${block.startLine}-${block.endLine})${isBeforeFrontmatter ? '; use a line after the frontmatter' : ''}`
            );
        }
    }
}

export type LineInsert = {
    afterLine: number;
    blankLinesBefore: number;
    blankLinesAfter: number;
    lines: readonly string[];
};

/**
 * Inserts whole lines after line `afterLine` (0 is the top). Blank lines before are not
 * added at the top of the file, and blank lines after not at its end.
 */
export function insertLines(content: string, {
    afterLine, blankLinesBefore, blankLinesAfter, lines,
}: LineInsert): { content: string; firstInsertedLine: number } {
    const fileLines = content.split('\n');
    const head = fileLines.slice(0, afterLine);
    const tail = fileLines.slice(afterLine);
    const isAtEnd = afterLine >= countLines(content);
    const blanks = (count: number) => Array.from({ length: count }, () => '');
    const blanksBefore = blanks(afterLine === 0 ? 0 : blankLinesBefore);

    return {
        content: [
            ...head,
            ...blanksBefore,
            ...lines,
            ...blanks(isAtEnd ? 0 : blankLinesAfter),
            ...tail,
        ].join('\n'),
        firstInsertedLine: afterLine + blanksBefore.length + 1,
    };
}

export function replaceLine(content: string, line: number, lines: readonly string[]): string {
    const fileLines = content.split('\n');

    fileLines.splice(line - 1, 1, ...lines);

    return fileLines.join('\n');
}

export function getLine(content: string, line: number): string | undefined {
    return line >= 1 && line <= countLines(content) ? content.split('\n')[line - 1] : undefined;
}

/** The task at `line` of the written file, in the format the task tools return. */
export function readWrittenTask(path: string, hash: string, content: string, line: number): VaultTask {
    const raw = getLine(content, line) ?? '';
    const parsed = parseTaskLine(raw);

    if (parsed === null || !parsed.ok) {
        throw new Error(`The written line ${line} of ${path} is not a valid task: ${raw}`);
    }

    return toVaultTask(path, hash, {
        line,
        raw,
        parsed,
        task: parsed.task,
    });
}
