export function prettyStringify (jsonObject: unknown): string {
    return JSON.stringify(jsonObject, undefined, 2);
}
