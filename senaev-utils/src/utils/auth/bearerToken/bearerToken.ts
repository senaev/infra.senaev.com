import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER_PREFIX = 'Bearer ';

/** The `Authorization` header value that carries `token`. */
export function createBearerAuthorizationHeader(token: string): string {
    return `${BEARER_PREFIX}${token}`;
}

function sha256(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

/**
 * Checks an `Authorization` header against the expected bearer token in constant time.
 *
 * Both sides are hashed first, because `timingSafeEqual` requires buffers of equal length,
 * and comparing lengths directly would leak the token length.
 */
export function isValidBearerAuthorizationHeader(header: unknown, expectedToken: string): boolean {
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX) || expectedToken === '') {
        return false;
    }

    return timingSafeEqual(sha256(header.slice(BEARER_PREFIX.length)), sha256(expectedToken));
}
