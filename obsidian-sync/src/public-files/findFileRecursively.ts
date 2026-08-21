import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Depth-first search for a file named exactly `filename` anywhere under `dir`.
 * Returns the absolute path, or `null` when the directory is missing/unreadable
 * or nothing matches.
 */
export function findFileRecursively(dir: string, filename: string): string | null {
    let entries;

    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return null;
    }

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            const found = findFileRecursively(fullPath, filename);

            if (found) {
                return found;
            }

            continue;
        }

        if (entry.isFile() && entry.name === filename) {
            return fullPath;
        }
    }

    return null;
}
