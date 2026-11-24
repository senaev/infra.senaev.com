import { parseReminderLine, type ReminderLineParseResult } from 'senaev-utils/src/obsidianReminders/reminderLine';

import { findRawBlocks, isLineInRawBlock } from '../markdown/rawBlocks';

export type ReminderLine = {
    /** 1-based. */
    line: number;
    raw: string;
    parsed: ReminderLineParseResult;
};

/** A cheap test before the Markdown parse, which most notes without reminders can skip. */
const MAYBE_REMINDER = /^[\s>]*(?:[-*+]|\d+[.)]) +\[.\]/mu;

/**
 * Every reminder line of a note, as the Tasks plugin finds them: lines in frontmatter, code
 * and HTML blocks are not reminders.
 */
export function findReminderLines(content: string): ReminderLine[] {
    if (!MAYBE_REMINDER.test(content)) {
        return [];
    }

    const rawBlocks = findRawBlocks(content);
    const result: ReminderLine[] = [];

    for (const [
        index,
        raw,
    ] of content.split('\n').entries()) {
        const parsed = parseReminderLine(raw);

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
