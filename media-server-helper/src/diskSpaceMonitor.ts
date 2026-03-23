import { readdir, stat, statfs } from "fs/promises";
import { join } from "path";

const DOWNLOADS_DIR = "/downloads";

const CHECK_INTERVAL_MS = 10_000;
const PERCENT_TRIGGER_TO_REMOVE = 70;
const PERCENT_REMOVE_TARGET = 60;

type DisksUsage = {
    totalBlocks: number;
    availableBlocks: number;
    blockSize: number;
};

type FileToRemove = {
    path: string;
    size: number;
    modifiedAtMs: number;
};

function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
}

async function getDiskUsage(path: string): Promise<DisksUsage> {
    const stats = await statfs(path);
    const totalBlocks = Number(stats.blocks);
    const availableBlocks = Number(stats.bavail);
    const blockSize = Number(stats.bsize);

    return {
        totalBlocks,
        availableBlocks,
        blockSize,
    };
}

async function removeOldFiles(bytesToRemove: number): Promise<void> {
    const dirEntries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
    const files = await Promise.all(
        dirEntries
            .filter((entry) => entry.isFile())
            .map(async (entry): Promise<FileToRemove> => {
                const path = join(DOWNLOADS_DIR, entry.name);
                const fileStats = await stat(path);

                return {
                    path,
                    size: fileStats.size,
                    modifiedAtMs: fileStats.mtimeMs,
                };
            }),
    );

    const sortedFiles = files.sort((a, b) => a.modifiedAtMs - b.modifiedAtMs);

    const filesToRemove: FileToRemove[] = [];
    let selectedBytes = 0;
    for (const file of sortedFiles) {
        filesToRemove.push(file);
        selectedBytes += file.size;

        if (selectedBytes >= bytesToRemove) {
            break;
        }
    }

    console.log(
        `🗂️ Selected files to remove count=[${filesToRemove.length}] size=[${formatBytes(selectedBytes)}]`,
    );
    for (const file of filesToRemove) {
        console.log(`🗂️ file=[${file.path}] size=[${formatBytes(file.size)}]`);
    }

    if (selectedBytes < bytesToRemove) {
        console.warn(
            `⚠️ Not enough files to remove. Selected=[${formatBytes(
                selectedBytes,
            )}] needed=[${formatBytes(bytesToRemove)}]`,
        );
    }
}

async function checkDiskSpace(): Promise<void> {
    const { totalBlocks, availableBlocks, blockSize } = await getDiskUsage(DOWNLOADS_DIR);
    const usedBlocks = totalBlocks - availableBlocks;
    const totalBytes = totalBlocks * blockSize;
    const usedBytes = usedBlocks * blockSize;
    const occupiedPercent = (usedBlocks / totalBlocks) * 100;

    console.log(
        `✅ Disk usage=[${occupiedPercent.toFixed(2)}]% total=[${formatBytes(totalBytes)}] used=[${formatBytes(usedBytes)}] blockSize=[${formatBytes(blockSize)}]`,
    );
    if (occupiedPercent < PERCENT_TRIGGER_TO_REMOVE) {
        return;
    }

    const percentToRemove = occupiedPercent - PERCENT_REMOVE_TARGET;
    const bytesToRemove = ((totalBlocks * percentToRemove) / 100) * blockSize;
    console.log(
        `💽 Need to remove [${percentToRemove.toFixed(2)}]% size=[${formatBytes(bytesToRemove)}]`,
    );

    await removeOldFiles(bytesToRemove);
}

async function runDiskSpaceMonitor(): Promise<void> {
    while (true) {
        try {
            await checkDiskSpace();
        } catch (error) {
            console.error("❌ Error checking disk space:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
}

export function startDiskSpaceMonitor(): void {
    runDiskSpaceMonitor().catch((error) => {
        console.error("❌ Error in disk space monitor:", error);
    });
}
