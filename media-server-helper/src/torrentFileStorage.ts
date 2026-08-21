import { renameSync, writeFileSync } from 'fs';
import { join } from 'path';

import { sanitizeFileName } from 'senaev-utils/src/utils/String/sanitizeFileName/sanitizeFileName';

export const TORRENT_FILES_DIR = '/watch-torrent-files';

export function writeTorrentFile(buffer: Buffer, fileName: string): string {
    const targetPath = join(TORRENT_FILES_DIR, sanitizeFileName(fileName));
    const tempPath = `${targetPath}.part`;

    writeFileSync(tempPath, buffer);
    renameSync(tempPath, targetPath);

    return targetPath;
}
