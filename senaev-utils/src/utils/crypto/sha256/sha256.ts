import { createHash } from 'node:crypto';

/** The SHA-256 digest of a UTF-8 string. */
export function sha256(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
}

/** The SHA-256 digest of a UTF-8 string as 64 lowercase hex characters. */
export function sha256Hex(value: string): string {
    return sha256(value).toString('hex');
}
