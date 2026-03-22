import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { TORRENT_FILES_DIR } from "./env";

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getTargetPath(fileName: string): string {
    const sanitized = sanitizeFileName(fileName);
    const basePath = join(TORRENT_FILES_DIR, sanitized);

    if (!existsSync(basePath)) {
        return basePath;
    }

    const lastDotIndex = sanitized.lastIndexOf(".");
    const basename = lastDotIndex > 0 ? sanitized.slice(0, lastDotIndex) : sanitized;
    const extension = lastDotIndex > 0 ? sanitized.slice(lastDotIndex) : "";

    for (let suffix = 1; ; suffix += 1) {
        const candidate = join(TORRENT_FILES_DIR, `${basename}-${suffix}${extension}`);
        if (!existsSync(candidate)) {
            return candidate;
        }
    }
}

export function writeTorrentFile(buffer: Buffer, fileName: string): string {
    if (!existsSync(TORRENT_FILES_DIR)) {
        mkdirSync(TORRENT_FILES_DIR, { recursive: true });
    }

    const targetPath = getTargetPath(fileName);
    const tempPath = `${targetPath}.part`;
    writeFileSync(tempPath, buffer);
    renameSync(tempPath, targetPath);
    return targetPath;
}
