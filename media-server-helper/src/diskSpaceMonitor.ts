import { statfs } from "fs/promises";
import { TORRENT_FILES_DIR } from "./env";

const CHECK_INTERVAL_MS = 10_000;

type DisksUsage = {
    totalBlocks: number;
    availableBlocks: number;
};

async function getDiskUsage(path: string): Promise<DisksUsage> {
    const stats = await statfs(TORRENT_FILES_DIR);
    const totalBlocks = Number(stats.blocks);
    const availableBlocks = Number(stats.bavail);

    return {
        totalBlocks,
        availableBlocks,
    };
}

async function checkDiskSpace(): Promise<void> {
    const { totalBlocks, availableBlocks } = await getDiskUsage(TORRENT_FILES_DIR);
    const usedBlocks = totalBlocks - availableBlocks;

    const occupiedPercent = (usedBlocks / totalBlocks) * 100;

    console.log(
        `💽 Disk usage path=[${TORRENT_FILES_DIR}] occupied=[${occupiedPercent.toFixed(2)}%]`,
    );
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
