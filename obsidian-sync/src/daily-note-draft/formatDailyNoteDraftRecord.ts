const RECORD_TIME_ZONE = 'Europe/Madrid';

/** `YYYY-MM-DD HH-MM-SS` in the owner's local time. */
export function formatRecordTimestamp(now: Date, timeZone: string = RECORD_TIME_ZONE): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);

    const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';

    return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}-${read('minute')}-${read('second')}`;
}

export function formatDailyNoteDraftRecord(text: string, now: Date): string {
    return `\n\n---\n${formatRecordTimestamp(now)}\n\n${text}`;
}
