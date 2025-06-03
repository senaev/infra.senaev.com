/**
 * FNV-1a hash generation init value.
 * More info: https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function#FNV_hash_parameters
 *
 * Stolen from https://github.com/schwarzkopfb/fnv1a/blob/master/index.ts
 */

const FNV_1A_HASH_BASE = 0x811c9dc5;

export function fnv1aStringHast(string: string): number {
    const l = string.length;
    let h = FNV_1A_HASH_BASE;

    for (let i = 0; i < l; i++) {
        h ^= string.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }

    return h >>> 0;
}
