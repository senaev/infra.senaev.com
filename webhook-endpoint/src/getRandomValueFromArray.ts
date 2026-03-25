export function getRandomValueFromArray<T>(values: T[]): T {
    if (values.length === 0) {
        throw new Error("Cannot get random value from empty array");
    }

    return values[Math.floor(Math.random() * values.length)]!;
}
