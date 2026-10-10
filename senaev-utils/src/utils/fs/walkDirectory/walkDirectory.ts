import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

export type WalkDirectoryFilters = {
    /** Gets the root-relative POSIX path of a folder; `false` skips it with everything below. */
    includeFolder?: (relativePath: string) => boolean;
    /** Gets the root-relative POSIX path of a file; `false` leaves it out of the result. */
    includeFile?: (relativePath: string) => boolean;
};

export type WalkDirectoryError = {
    /** Root-relative POSIX path of the folder that could not be read, `''` for the root. */
    path: string;
    error: unknown;
};

export type WalkDirectoryResult = {
    /** Root-relative POSIX paths of the files, in no particular order. */
    files: string[];
    errors: WalkDirectoryError[];
};

/**
 * Every file below `root/startFolder`, at any depth, as paths relative to `root`.
 *
 * Symlinks are never followed: a `Dirent` describes the entry itself, so a link is neither
 * a file nor a folder here. A folder that cannot be read (for example, one that vanished
 * during the walk) is reported in `errors`, and the walk goes on. The folders are read one
 * at a time, because thousands of parallel reads can run out of file descriptors.
 */
export async function walkDirectory(
    root: string,
    startFolder = '',
    { includeFolder = () => true, includeFile = () => true }: WalkDirectoryFilters = {}
): Promise<WalkDirectoryResult> {
    const files: string[] = [];
    const errors: WalkDirectoryError[] = [];
    const pending = [startFolder];

    while (pending.length > 0) {
        const folder = pending.pop() ?? '';

        try {
            for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
                const path = folder === '' ? entry.name : posix.join(folder, entry.name);

                if (entry.isDirectory() && includeFolder(path)) {
                    pending.push(path);
                } else if (entry.isFile() && includeFile(path)) {
                    files.push(path);
                }
            }
        } catch (error) {
            errors.push({
                path: folder,
                error,
            });
        }
    }

    return {
        files,
        errors,
    };
}
