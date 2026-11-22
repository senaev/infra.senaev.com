export function tryStringify(obj: unknown): string | undefined {
    let result;

    try {
        result = JSON.stringify(obj);
    } catch {
        // not stringifiable
    }

    return result;
}
