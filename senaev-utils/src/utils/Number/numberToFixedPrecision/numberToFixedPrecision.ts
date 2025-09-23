export function numberToFixedPrecision(number: number): string {
    const log10 = Math.floor(Math.log10(number));
    const toFixed = Math.max(0, 4 - log10);

    return number.toFixed(toFixed);
}
