import { renameSync, writeFileSync } from "fs";
import { join } from "path";

export const TORRENT_FILES_DIR = "/watch-torrent-files";

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function writeTorrentFile(buffer: Buffer, fileName: string): string {
    const targetPath = join(TORRENT_FILES_DIR, sanitizeFileName(fileName));
    const tempPath = `${targetPath}.part`;
    writeFileSync(tempPath, buffer);
    renameSync(tempPath, targetPath);
    return targetPath;
}
