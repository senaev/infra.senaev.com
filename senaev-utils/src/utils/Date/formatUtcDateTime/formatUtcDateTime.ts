export type FormatUtcDateTimeOptions = {
    /**
     * Append `:ss`. Off by default, because most report lines only need minute
     * resolution.
     */
    withSeconds?: boolean;
};

/**
 * Formats a date as `DD-MM-YYYY HH:mm` in UTC, optionally with seconds.
 *
 * UTC is used rather than local time so that output does not depend on the
 * timezone of the container that happens to render it.
 */
export function formatUtcDateTime(date: Date, { withSeconds = false }: FormatUtcDateTimeOptions = {}): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    const time = withSeconds
        ? `${hours}:${minutes}:${String(date.getUTCSeconds()).padStart(2, '0')}`
        : `${hours}:${minutes}`;

    return `${day}-${month}-${year} ${time}`;
}
