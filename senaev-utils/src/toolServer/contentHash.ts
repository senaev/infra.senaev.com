import { sha256Hex } from '../utils/crypto/sha256/sha256';

import { requiredNonEmptyString, type ToolArguments } from './toolArguments';
import { invalidArguments, ToolError } from './ToolError';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Identifies one exact version of a file, so an edit can prove it saw the latest one. */
export function hashContent(content: string): string {
    return sha256Hex(content);
}

/** Reads a hash argument; the hash identifies the whole file returned by a read. */
export function readExpectedHash(args: ToolArguments, key: string): string {
    const expectedHash = requiredNonEmptyString(args, key).toLowerCase();

    if (!SHA256_HEX.test(expectedHash)) {
        throw invalidArguments(`"${key}" must be a 64-character SHA-256 hash from the latest read`);
    }

    return expectedHash;
}

/** Refuses an edit of a version that the caller did not read. */
export function assertExpectedHash(content: string, expectedHash: string, documentName: string): void {
    const currentHash = hashContent(content);

    if (currentHash !== expectedHash) {
        throw new ToolError('conflict', `The ${documentName} changed since it was read; read it again and repeat the edit on the new version`, {
            currentHash,
        });
    }
}
