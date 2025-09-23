export function numberToFixedPrecision(number: number, precision = 4): string {
    const absNumber = Math.abs(number);
    const log10 = Math.log10(absNumber);
    const log10Int = Math.floor(log10);
    const toFixed = Math.max(0, precision - log10Int);

    return number.toFixed(toFixed);
}
