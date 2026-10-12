import { invalidArguments } from '../commands/CommandError';

import { requiredNonEmptyString, type ToolArguments } from './toolArguments';

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Reads a hash argument; the hash identifies the whole file returned by a read. */
export function readExpectedHash(args: ToolArguments, key: string): string {
    const expectedHash = requiredNonEmptyString(args, key).toLowerCase();

    if (!SHA256_HEX.test(expectedHash)) {
        throw invalidArguments(`"${key}" must be a 64-character SHA-256 hash from the latest read`);
    }

    return expectedHash;
}
