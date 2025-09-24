export function numberToFixedPrecision(number: number, precision = 4): string {
    // Handle zero as a special case since Math.log10(0) returns -Infinity
    if (number === 0) {
        return '0';
    }

    const absNumber = Math.abs(number);
    const log10 = Math.log10(absNumber);
    const log10Int = Math.floor(log10);
    const toFixed = Math.max(0, precision - log10Int);

    return number.toFixed(toFixed);
}
