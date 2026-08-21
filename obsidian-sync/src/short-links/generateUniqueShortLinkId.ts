import { randomInt } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

// 6 chars over a 36-char alphabet gives ~2.2e9 possible ids, which is more than
// enough to make brute-force/enumeration impractical for personal use while
// keeping ids short enough to be comfortably shareable.
const ID_LENGTH = 6;
const MAX_ATTEMPTS = 10;

/** Uniform, unbiased draw per character. */
function generateRandomShortLinkId(): string {
    let id = '';

    for (let i = 0; i < ID_LENGTH; i++) {
        id += ALPHABET.charAt(randomInt(0, ALPHABET.length));
    }

    return id;
}

/**
 * Generates a random short link id that isn't already present in `existingIds`.
 * Collisions are astronomically unlikely at this id space size, but this still
 * retries defensively rather than ever risking overwriting an existing entry.
 */
export function generateUniqueShortLinkId(existingIds: { has: (id: string) => boolean }): string {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = generateRandomShortLinkId();

        if (!existingIds.has(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Failed to generate a unique short link id after ${MAX_ATTEMPTS} attempts`);
}
