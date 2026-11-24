import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { parseReminderLine } from 'senaev-utils/src/obsidianReminders/reminderLine';

import { findRawBlocks, type RawBlockKind } from '../markdown/rawBlocks';

import { toVaultReminder, type VaultReminder } from './scanVaultReminders';

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
 * Refuses an insert after `afterLine` that would land inside a block where a reminder line is
 * not a reminder, or before the frontmatter, which must stay the first thing in the note.
 */
export function assertReminderInsertPosition(content: string, afterLine: number): void {
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
                `A reminder cannot be inserted after line ${afterLine}: it is inside ${RAW_BLOCK_NAMES[block.kind]} (lines ${block.startLine}-${block.endLine})${isBeforeFrontmatter ? '; use a line after the frontmatter' : ''}`
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

/** The reminder at `line` of the written file, in the format the reminder tools return. */
export function readWrittenReminder(path: string, hash: string, content: string, line: number): VaultReminder {
    const raw = getLine(content, line) ?? '';
    const parsed = parseReminderLine(raw);

    if (parsed === null || !parsed.ok) {
        throw new Error(`The written line ${line} of ${path} is not a valid reminder: ${raw}`);
    }

    return toVaultReminder(path, hash, {
        line,
        raw,
        parsed,
        reminder: parsed.reminder,
    });
}
