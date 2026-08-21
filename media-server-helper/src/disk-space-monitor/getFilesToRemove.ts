import { readdir, stat } from 'fs/promises';
import { basename, join } from 'path';

export type FileToRemove = {
    path: string;
    name: string;
    size: number;
    createdAtMs: number;
    modifiedAtMs: number;
};

export async function getFilesToRemove({
    bytesToRemove,
    pathToRemoveFiles,
}: {
    bytesToRemove: number;
    pathToRemoveFiles: string;
}): Promise<{
        filesToRemove: FileToRemove[];
        filesToRemoveSizeBytes: number;
    }> {
    // The selection loop below appends before it checks the running total, so without this
    // guard a request to free nothing would still nominate the oldest file for deletion.
    if (bytesToRemove <= 0) {
        return {
            filesToRemove: [],
            filesToRemoveSizeBytes: 0,
        };
    }

    const dirEntries = await readdir(pathToRemoveFiles, {
        recursive: true,
        withFileTypes: true,
    });
    const files = await Promise.all(dirEntries
        .filter((entry) => entry.isFile())
        .map(async (entry): Promise<FileToRemove> => {
            const path = join(entry.parentPath, entry.name);
            const fileStats = await stat(path);

            return {
                path,
                name: basename(path),
                size: fileStats.size,
                createdAtMs: fileStats.birthtimeMs,
                modifiedAtMs: fileStats.mtimeMs,
            };
        }));
    const sortedFiles = files.sort((a, b) => a.modifiedAtMs - b.modifiedAtMs);

    const filesToRemove: FileToRemove[] = [];
    let filesToRemoveSizeBytes = 0;

    for (const file of sortedFiles) {
        filesToRemove.push(file);
        filesToRemoveSizeBytes += file.size;

        if (filesToRemoveSizeBytes >= bytesToRemove) {
            break;
        }
    }

    return {
        filesToRemove,
        filesToRemoveSizeBytes,
    };
}
