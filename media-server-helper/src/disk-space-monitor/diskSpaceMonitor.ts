import { DISK_USAGE_PATH, PERCENT_REMOVE_TARGET, PERCENT_TRIGGER_TO_REMOVE } from "../env";
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
    const diskUsageMessage = `✅ Disk usage=[${occupiedPercent.toFixed(2)}]% limit=[${PERCENT_TRIGGER_TO_REMOVE}]% total=[${formatBytes(totalBytes)}] used=[${formatBytes(usedBytes)}] blockSize=[${formatBytes(blockSize)}]`;

    if (diskUsageMessage !== lastDiskUsageMessage) {
        console.log(diskUsageMessage);
        lastDiskUsageMessage = diskUsageMessage;
    }

    if (!removeInfo) {
        isRemovingFiles = false;
        return;
    }

    if (isRemovingFiles) {
        console.warn(`⚠️ Still removing files from previous check.`);
        return;
    }

    const { percentToRemove, bytesToRemove } = removeInfo;
    console.warn(
        `👉 Disk usage above threshold=[${PERCENT_TRIGGER_TO_REMOVE}%], need to remove=[${percentToRemove.toFixed(2)}]% bytes=[${formatBytes(bytesToRemove)}]`,
    );

    const { filesToRemove, filesToRemoveSizeBytes } = await getFilesToRemove({
        bytesToRemove,
        pathToRemoveFiles: DOWNLOADS_DIR,
    });

    console.log(
        `🗑️ Selected files to remove count=[${filesToRemove.length}] size=[${formatBytes(filesToRemoveSizeBytes)}]`,
    );

    for (const file of filesToRemove) {
        console.log(
            `🗂️ file=[${file.path}] size=[${formatBytes(file.size)}] created=[${new Date(file.createdAtMs).toISOString()}]`,
        );
    }

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
            console.warn(
                `⚠️ Not enough files to remove. Selected=[${formatBytes(
                    filesToRemoveSizeBytes,
                )}] needed=[${formatBytes(bytesToRemove)}]`,
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
