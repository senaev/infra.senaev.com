import { PERCENT_REMOVE_TARGET, PERCENT_TRIGGER_TO_REMOVE } from "../env";
import { formatBytes } from "./formatBytes";
import { getFilesToRemove } from "./getFilesToRemove";
import { getSpaceInfoToRemove } from "./getSpaceInfoToRemove";
import { removeFiles, sendRemovalNotification } from "./removeFilesAndNotify";

const DOWNLOADS_DIR = "/downloads";

// Root /downloads folder is in-pod container
// We should take one of the folders mounded as a hostPath
const FOLDER_TO_CHECK_USAGE = `${DOWNLOADS_DIR}/complete`;

const CHECK_INTERVAL_MS = 10_000;

let isRemovingFiles = false;

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
    const spaceAfterRemovalBytes = totalBytes - (usedBytes - filesToRemoveSizeBytes);
    const spaceAfterRemovalBytesPercent = (spaceAfterRemovalBytes / totalBytes) * 100;

    console.log(
        `🗑️ Selected files to remove count=[${filesToRemove.length}] size=[${formatBytes(filesToRemoveSizeBytes)}]`,
    );

    for (const file of filesToRemove) {
        console.log(
            `🗂️ file=[${file.path}] size=[${formatBytes(file.size)}] created=[${new Date(file.createdAtMs).toISOString()}]`,
        );
    }

    isRemovingFiles = true;

    const notEnoughFilesToRemove = filesToRemoveSizeBytes < bytesToRemove;

    await removeFiles(filesToRemove);

    await sendRemovalNotification({
        removedFiles: filesToRemove,
        removedBytes: filesToRemoveSizeBytes,
        bytesToRemove,
        occupiedPercentBefore: occupiedPercent,
        occupiedPercentAfter: spaceAfterRemovalBytesPercent,
        totalBytes,
        usedBytesBefore: usedBytes,
        usedBytesAfter: spaceAfterRemovalBytes,
    });

    if (notEnoughFilesToRemove) {
        console.warn(
            `⚠️ Not enough files to remove. Selected=[${formatBytes(
                filesToRemoveSizeBytes,
            )}] needed=[${formatBytes(bytesToRemove)}]`,
        );
    } else {
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
