import { sha256Hex } from '../utils/crypto/sha256/sha256';

import { requiredNonEmptyString, type ToolArguments } from './toolArguments';
import { invalidArguments, ToolError } from './ToolError';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Identifies one exact version of a file, so an edit can prove it saw the latest one. */
export function hashContent(content: string): string {
    return sha256Hex(content);
}

/** Reads a hash argument; `readToolName` tells the model where the hash comes from. */
export function readExpectedHash(args: ToolArguments, key: string, readToolName: string): string {
    const expectedHash = requiredNonEmptyString(args, key).toLowerCase();

    if (!SHA256_HEX.test(expectedHash)) {
        throw invalidArguments(`"${key}" must be the "hash" value from ${readToolName}`);
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
