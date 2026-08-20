export function isNumber(value: unknown): value is number {
    return typeof value === 'number';
}

export function assertNumber(value: unknown, message?: string): asserts value is number {
    if (!isNumber(value)) {
        let errorMessage = `value=[${value}] is not a number`;

        if (message !== undefined) {
            errorMessage += ` message=[${message}]`;
        }

        throw new Error(errorMessage);
    }
}
