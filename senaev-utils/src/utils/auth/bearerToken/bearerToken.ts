import { timingSafeEqual } from 'node:crypto';

import { sha256 } from '../../crypto/sha256/sha256';

const BEARER_HEADER = /^Bearer (\S+)$/i;

/** The `Authorization` header value that carries `token`. */
export function createBearerAuthorizationHeader(token: string): string {
    return `Bearer ${token}`;
}

/** The token of a `Bearer <token>` header, or `undefined` for anything else. */
export function parseBearerToken(header: unknown): string | undefined {
    return typeof header === 'string' ? BEARER_HEADER.exec(header)?.[1] : undefined;
}

/**
 * Checks an `Authorization` header against the expected bearer token in constant time.
 *
 * Both sides are hashed first, because `timingSafeEqual` requires buffers of equal length,
 * and comparing lengths directly would leak the token length.
 */
export function isValidBearerAuthorizationHeader(header: unknown, expectedToken: string): boolean {
    const token = parseBearerToken(header);

    if (token === undefined || expectedToken === '') {
        return false;
    }

    return timingSafeEqual(sha256(token), sha256(expectedToken));
}
