export function getObjectKeys<T extends Record<string, unknown>>(object: T): (keyof T)[] {
    return Object.keys(object);
}
