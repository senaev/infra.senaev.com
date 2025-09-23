export function numberToFixedPrecision(number: number, precision = 4): string {
    const log10 = Math.floor(Math.log10(number));
    const toFixed = Math.max(0, precision - log10);

    return number.toFixed(toFixed);
}
