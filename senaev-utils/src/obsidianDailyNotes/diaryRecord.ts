import { CommandError, invalidArguments } from '../commands/CommandError';

import { DIARY_RECORD_MARKER } from './dailyNoteTemplate';

export { DIARY_RECORD_MARKER };

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
    return line.replace(/\uFE0F/g, '').trim();
}

// CommonMark: a fence is indented by at most 3 spaces; a closing fence has the same
// character, at least the same length, and nothing but spaces or tabs after it.
const OPENING_FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

// A line indented by 4 spaces or a tab can be an indented code block, so it is never an anchor.
const AT_MOST_THREE_SPACES = /^ {0,3}\S/;

function isAnchorLine(line: string, anchor: string): boolean {
    return AT_MOST_THREE_SPACES.test(line) && normalizeLine(line) === normalizeLine(anchor);
}

/**
 * The offset of the start of the first line, outside fenced code blocks, that is exactly
 * `anchor`, or `undefined`.
 */
function findAnchorLine(content: string, anchor: string): number | undefined {
    let fence: string | undefined;
    let offset = 0;

    for (const line of content.split('\n')) {
        if (fence === undefined) {
            const opening = OPENING_FENCE.exec(line)?.[1];

            if (opening !== undefined) {
                fence = opening;
            } else if (isAnchorLine(line, anchor)) {
                return offset;
            }
        } else {
            const closing = CLOSING_FENCE.exec(line)?.[1];

            if (closing !== undefined && closing[0] === fence[0] && closing.length >= fence.length) {
                fence = undefined;
            }
        }

        offset += line.length + 1;
    }

    return undefined;
}

/**
 * Where the next diary record goes: the start of the `⬆️ Daily Note ⬆️` line, or `undefined`
 * when the note has none.
 */
export function findDiaryRecordAnchor(content: string): number | undefined {
    return findAnchorLine(content, DIARY_RECORD_MARKER);
}

/**
 * Whether `text` contains the `⬆️ Daily Note ⬆️` line. A record must not: the next record
 * would be inserted in the middle of it.
 */
export function containsAnchorLine(text: string): boolean {
    return text.split('\n').some((line) => normalizeLine(line) === normalizeLine(DIARY_RECORD_MARKER));
}

/**
 * Inserts `records`, in order, each as its own paragraph separated by blank lines, right
 * above the anchor line (see `findDiaryRecordAnchor`) of the note as it was before this call.
 * Later records land under earlier ones. Throws a `conflict` CommandError when the note has no
 * anchor, and `invalid_arguments` when a record contains an anchor line.
 */
export function insertDiaryRecords(content: string, records: readonly string[], notePath: string): string {
    for (const record of records) {
        if (containsAnchorLine(record)) {
            throw invalidArguments(`A diary record must not contain the line "${DIARY_RECORD_MARKER}"`);
        }
    }

    const anchor = findDiaryRecordAnchor(content);

    if (anchor === undefined) {
        throw new CommandError(
            'conflict',
            `Daily note "${notePath}" has no "${DIARY_RECORD_MARKER}" line, so there is no place for the diary record. Add the line where new records should go.`
        );
    }

    const before = content.slice(0, anchor);
    let separator = '\n\n';

    if (before === '' || before.endsWith('\n\n')) {
        separator = '';
    } else if (before.endsWith('\n')) {
        separator = '\n';
    }

    const paragraphs = records.map((record) => `${record.replace(/^\n+|\n+$/g, '')}\n\n`).join('');

    return `${before}${separator}${paragraphs}${content.slice(anchor)}`;
}
