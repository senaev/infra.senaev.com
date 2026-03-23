import { readdir, stat, statfs } from "fs/promises";
import { join } from "path";

const DOWNLOADS_DIR = "/downloads";

// Root /downloads folder is in-pod container
// We should take one of the folders mounded as a hostPath
const FOLDER_TO_CHECK_USAGE = `${DOWNLOADS_DIR}/complete`;

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

async function getFilesToRemove({
    bytesToRemove,
    pathToRemoveFiles,
}: {
    bytesToRemove: number;
    pathToRemoveFiles: string;
}): Promise<{
    filesToRemove: FileToRemove[];
    filesToRemoveSizeBytes: number;
}> {
    const dirEntries = await readdir(pathToRemoveFiles, {
        recursive: true,
        withFileTypes: true,
    });
    const files = await Promise.all(
        dirEntries
            .filter((entry) => entry.isFile())
            .map(async (entry): Promise<FileToRemove> => {
                const path = join(entry.parentPath, entry.name);
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
    let filesToRemoveSizeBytes = 0;
    for (const file of sortedFiles) {
        filesToRemove.push(file);
        filesToRemoveSizeBytes += file.size;

        if (filesToRemoveSizeBytes >= bytesToRemove) {
            break;
        }
    }

    return { filesToRemove, filesToRemoveSizeBytes };
}

async function getSpaceInfoToRemove({
    folderToCheckUsage,
    percentTriggerToRemove,
    percentRemoveTarget,
}: {
    folderToCheckUsage: string;
    percentTriggerToRemove: number;
    percentRemoveTarget: number;
}): Promise<{
    usage: DisksUsage;
    occupiedPercent: number;
    removeInfo?: {
        percentToRemove: number;
        bytesToRemove: number;
    };
}> {
    const usage = await getDiskUsage(folderToCheckUsage);
    const { totalBlocks, availableBlocks, blockSize } = usage;
    const usedBlocks = totalBlocks - availableBlocks;
    const occupiedPercent = (usedBlocks / totalBlocks) * 100;

    if (occupiedPercent < percentTriggerToRemove) {
        return {
            usage,
            occupiedPercent,
        };
    }

    const percentToRemove = occupiedPercent - percentRemoveTarget;
    const bytesToRemove = ((totalBlocks * percentToRemove) / 100) * blockSize;
    return {
        usage,
        occupiedPercent,
        removeInfo: {
            percentToRemove,
            bytesToRemove,
        },
    };
}

async function checkDiskSpace(): Promise<void> {
    const {
        usage: { totalBlocks, availableBlocks, blockSize },
        occupiedPercent,
        removeInfo,
    } = await getSpaceInfoToRemove({
        folderToCheckUsage: FOLDER_TO_CHECK_USAGE,
        percentRemoveTarget: PERCENT_REMOVE_TARGET,
        percentTriggerToRemove: PERCENT_TRIGGER_TO_REMOVE,
    });

    const totalBytes = totalBlocks * blockSize;
    const usedBytes = (totalBlocks - availableBlocks) * blockSize;
    console.log(
        `✅ Disk usage=[${occupiedPercent.toFixed(2)}]% total=[${formatBytes(totalBytes)}] used=[${formatBytes(usedBytes)}] blockSize=[${formatBytes(blockSize)}]`,
    );
    if (!removeInfo) {
        return;
    }

    const { percentToRemove, bytesToRemove } = removeInfo;
    console.warn(
        `👉 Disk usage above threshold=[${PERCENT_TRIGGER_TO_REMOVE}%], need to remove=[${percentToRemove.toFixed(2)}]% bytes=[${formatBytes(bytesToRemove)}]`,
    );

    const { filesToRemove, filesToRemoveSizeBytes } = await getFilesToRemove({
        bytesToRemove,
        pathToRemoveFiles: FOLDER_TO_CHECK_USAGE,
    });

    console.log(
        `🗑️ Selected files to remove count=[${filesToRemove.length}] size=[${formatBytes(filesToRemoveSizeBytes)}]`,
    );

    if (filesToRemoveSizeBytes < bytesToRemove) {
        console.warn(
            `⚠️ Not enough files to remove. Selected=[${formatBytes(
                filesToRemoveSizeBytes,
            )}] needed=[${formatBytes(bytesToRemove)}]`,
        );
    }

    for (const file of filesToRemove) {
        console.log(`🗂️ file=[${file.path}] size=[${formatBytes(file.size)}]`);
    }
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
