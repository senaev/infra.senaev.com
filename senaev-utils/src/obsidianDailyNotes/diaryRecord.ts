import { CommandError } from '../commands/CommandError';

import { DAILY_NOTE_STREAM_EMBED } from './dailyNoteTemplate';

/**
 * A line of its own in a daily note: new diary records go right above it, so the records
 * of a day stay in the order they were written.
 */
export const DIARY_RECORD_MARKER = '⬆️ Daily Note ⬆️';

const RECORD_TIME_ZONE = 'Europe/Madrid';

/** `YYYY-MM-DD HH:mm` in the owner's local time. */
export function formatRecordTimestamp(now: Date, timeZone: string = RECORD_TIME_ZONE): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);

    const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';

    return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`;
}

/**
 * One diary record of `day`, as one paragraph without surrounding blank lines: a link to
 * the day with the time it was written, the text, and the ✍️ mark.
 */
export function formatDiaryRecord(day: string, text: string, now: Date): string {
    return `[[${day}|🎙️ ${formatRecordTimestamp(now)}]]: ${text} ✍️`;
}

// Emoji are written with or without the variation selector; both mean the same marker.
function normalizeLine(line: string): string {
    return line.replace(/️/g, '').trim();
}

const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * The offset of the start of the first line, outside code blocks, that is exactly
 * `anchor`, or `undefined`.
 */
function findAnchorLine(content: string, anchor: string): number | undefined {
    const wanted = normalizeLine(anchor);
    let fence: string | undefined;
    let offset = 0;

    for (const line of content.split('\n')) {
        const fenceMatch = FENCE.exec(line);

        if (fenceMatch?.[1] !== undefined) {
            const marker = fenceMatch[1];

            if (fence === undefined) {
                fence = marker;
            } else if (marker[0] === fence[0] && marker.length >= fence.length) {
                fence = undefined;
            }
        } else if (fence === undefined && normalizeLine(line) === wanted) {
            return offset;
        }

        offset += line.length + 1;
    }

    return undefined;
}

/**
 * Where the next diary record goes: the start of the `⬆️ Daily Note ⬆️` line, else the start
 * of the `![[daily_note_stream]]` line. `undefined` when the note has neither.
 */
export function findDiaryRecordAnchor(content: string): number | undefined {
    return findAnchorLine(content, DIARY_RECORD_MARKER) ?? findAnchorLine(content, DAILY_NOTE_STREAM_EMBED);
}

/**
 * Inserts `record` as its own paragraph right above the anchor line (see
 * `findDiaryRecordAnchor`), separated by blank lines. Each next record of the note lands
 * under the previous one. Throws a `conflict` CommandError when the note has no anchor:
 * there is no safe place to put the record.
 */
export function insertDiaryRecord(content: string, record: string, notePath: string): string {
    const anchor = findDiaryRecordAnchor(content);

    if (anchor === undefined) {
        throw new CommandError(
            'conflict',
            `Daily note "${notePath}" has neither a "${DIARY_RECORD_MARKER}" line nor a "${DAILY_NOTE_STREAM_EMBED}" line, so there is no place for the diary record. Add one of them to the note.`
        );
    }

    const before = content.slice(0, anchor);
    let separator = '\n\n';

    if (before === '' || before.endsWith('\n\n')) {
        separator = '';
    } else if (before.endsWith('\n')) {
        separator = '\n';
    }

    return `${before}${separator}${record.replace(/^\n+|\n+$/g, '')}\n\n${content.slice(anchor)}`;
}
