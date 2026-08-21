import { Bytes } from '../Bytes';

const UNITS = [
    'B',
    'KB',
    'MB',
    'GB',
    'TB',
];

export type FormatBytesOptions = {
    /**
     * Always render this many digits after the decimal point. When omitted the
     * number of digits adapts: one digit below 10 of any unit above bytes, none
     * otherwise.
     */
    fractionDigits?: number;
};

/**
 * Renders a byte count with a binary unit suffix.
 *
 * The unit index is clamped to the last known unit, so a value beyond TB keeps
 * a real suffix instead of running off the end of the table, and a negative
 * value is rendered in bytes rather than producing NaN.
 */
export function formatBytes(bytes: Bytes, { fractionDigits }: FormatBytesOptions = {}): string {
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < UNITS.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    let formattedValue: string;

    if (fractionDigits === undefined) {
        formattedValue = unitIndex > 0 && value < 10
            ? value.toFixed(1)
            : Math.round(value).toString(10);
    } else {
        formattedValue = value.toFixed(fractionDigits);
    }

    return `${formattedValue} ${UNITS[unitIndex]}`;
}
