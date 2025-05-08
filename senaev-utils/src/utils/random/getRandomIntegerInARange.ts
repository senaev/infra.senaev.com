export function getRandomIntegerInARange(min: number, max: number) {
    return min + (((max - min + 1) * Math.random()) ^ 0);
}
