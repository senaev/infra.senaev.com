import { sha256Hex } from '../utils/crypto/sha256/sha256';
import { CommandError } from '../commands/CommandError';

/** Identifies one exact version of a file, so an edit can prove it saw the latest one. */
export function hashContent(content: string): string {
    return sha256Hex(content);
}

/** Refuses an edit of a version that the caller did not read. */
export function assertExpectedHash(content: string, expectedHash: string, documentName: string): void {
    const currentHash = hashContent(content);

    if (currentHash !== expectedHash) {
        throw new CommandError('conflict', `The ${documentName} changed since it was read; read it again and repeat the edit on the new version`, {
            currentHash,
        });
    }
}
