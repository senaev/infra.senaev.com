import { DISK_USAGE_PATH, PERCENT_REMOVE_TARGET, PERCENT_TRIGGER_TO_REMOVE } from "../env";
import { logger } from "../logger";
import { formatBytes } from "./formatBytes";
import { getDiskUsage } from "./getDiskUsage";
import { getFilesToRemove } from "./getFilesToRemove";
import { getSpaceInfoToRemove } from "./getSpaceInfoToRemove";
import {
    removeFiles,
    sendManualCleanupRequiredNotification,
    sendRemovalNotification,
} from "./removeFilesAndNotify";

const DOWNLOADS_DIR = "/downloads";

const CHECK_INTERVAL_MS = 10_000;

let isRemovingFiles = false;
let lastDiskUsageMessage = "";

async function checkDiskSpace(): Promise<void> {
    const {
        usage: { totalBlocks, availableBlocks, blockSize },
        occupiedPercent,
        removeInfo,
    } = await getSpaceInfoToRemove({
        folderToCheckUsage: DISK_USAGE_PATH,
        percentRemoveTarget: PERCENT_REMOVE_TARGET,
        percentTriggerToRemove: PERCENT_TRIGGER_TO_REMOVE,
    });

    const totalBytes = totalBlocks * blockSize;
    const usedBytes = (totalBlocks - availableBlocks) * blockSize;
    const diskUsageMessage = `${occupiedPercent.toFixed(2)}% of ${formatBytes(totalBytes)}`;

    if (diskUsageMessage !== lastDiskUsageMessage) {
        logger.info(
            { occupiedPercent, totalBytes, usedBytes, blockSize },
            "💾 Disk usage",
        );
        lastDiskUsageMessage = diskUsageMessage;
    }

    if (!removeInfo) {
        isRemovingFiles = false;
        return;
    }

    if (isRemovingFiles) {
        logger.warn("⚠️ Still removing files from previous check");
        return;
    }

    const { percentToRemove, bytesToRemove } = removeInfo;
    logger.warn(
        { percentTrigger: PERCENT_TRIGGER_TO_REMOVE, percentToRemove, bytesToRemove },
        "⚠️ Disk usage above threshold, need to remove files",
    );

    const { filesToRemove, filesToRemoveSizeBytes } = await getFilesToRemove({
        bytesToRemove,
        pathToRemoveFiles: DOWNLOADS_DIR,
    });

    logger.info(
        {
            count: filesToRemove.length,
            sizeBytes: filesToRemoveSizeBytes,
            files: filesToRemove.map((f) => ({
                path: f.path,
                sizeBytes: f.size,
                createdAt: new Date(f.createdAtMs).toISOString(),
            })),
        },
        "🗑️ Selected files to remove",
    );

    isRemovingFiles = true;
    try {
        const notEnoughFilesToRemove = filesToRemoveSizeBytes < bytesToRemove;

        await removeFiles(filesToRemove);
        const usageAfterRemoval = await getDiskUsage(DISK_USAGE_PATH);
        const totalBytesAfterRemoval = usageAfterRemoval.totalBlocks * usageAfterRemoval.blockSize;
        const usedBytesAfterRemoval =
            (usageAfterRemoval.totalBlocks - usageAfterRemoval.availableBlocks) *
            usageAfterRemoval.blockSize;
        const occupiedPercentAfterRemoval =
            ((usageAfterRemoval.totalBlocks - usageAfterRemoval.availableBlocks) /
                usageAfterRemoval.totalBlocks) *
            100;

        await sendRemovalNotification({
            removedFiles: filesToRemove,
            removedBytes: filesToRemoveSizeBytes,
            bytesToRemove,
            occupiedPercentBefore: occupiedPercent,
            occupiedPercentAfter: occupiedPercentAfterRemoval,
            totalBytes: totalBytesAfterRemoval,
            usedBytesBefore: usedBytes,
            usedBytesAfter: usedBytesAfterRemoval,
        });

        if (notEnoughFilesToRemove) {
            logger.warn(
                { selected: formatBytes(filesToRemoveSizeBytes), needed: formatBytes(bytesToRemove) },
                "⚠️ Not enough files to remove",
            );
            await sendManualCleanupRequiredNotification({
                bytesToRemove,
                removableBytes: filesToRemoveSizeBytes,
                totalBytes: totalBytesAfterRemoval,
                usedBytes: usedBytesAfterRemoval,
                occupiedPercent: occupiedPercentAfterRemoval,
            });
        }
    } finally {
        isRemovingFiles = false;
    }
}

async function runDiskSpaceMonitor(): Promise<void> {
    while (true) {
        try {
            await checkDiskSpace();
        } catch (error) {
            logger.error(error, "❌ Error checking disk space");
        }

        await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
}

export function startDiskSpaceMonitor(): void {
    runDiskSpaceMonitor().catch((error) => {
        logger.error(error, "❌ Error in disk space monitor");
    });
}
