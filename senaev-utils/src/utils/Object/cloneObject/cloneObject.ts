export function cloneObject<T>(object: T): T {
    return structuredClone(object);
}
