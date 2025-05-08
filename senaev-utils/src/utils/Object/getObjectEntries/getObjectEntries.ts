import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

export function getObjectEntries<Key extends string, Value>(object: Record<Key, Value>): [Key, Value][] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (Object as any).entries === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (Object as any).entries(object);
    }

    return getObjectKeys(object).map((key) => [
        key,
        object[key],
    ] as [Key, Value]);
}
