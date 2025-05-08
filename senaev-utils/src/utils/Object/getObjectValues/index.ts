export function getObjectValues<T extends Record<string, unknown>>(object: T): T[keyof T][] {
    return Object.values(object) as T[keyof T][];
}
