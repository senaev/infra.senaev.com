import { existsSync, statfsSync } from "fs";
import { dirname } from "path";
import { TORRENT_FILES_DIR } from "./env";

const CHECK_INTERVAL_MS = 10_000;

function getMonitoredPath(): string {
    if (existsSync(TORRENT_FILES_DIR)) {
        return TORRENT_FILES_DIR;
    }

    return dirname(TORRENT_FILES_DIR);
}

function logDiskUsage(): void {
    const monitoredPath = getMonitoredPath();
    const stats = statfsSync(monitoredPath);
    const totalBlocks = Number(stats.blocks);
    const availableBlocks = Number(stats.bavail);
    const usedBlocks = totalBlocks - availableBlocks;
    const occupiedPercent = (usedBlocks / totalBlocks) * 100;

    console.log(
        `💽 Disk usage path=[${monitoredPath}] occupied=[${occupiedPercent.toFixed(2)}%]`,
    );
}

export function startDiskSpaceMonitor(): void {
    logDiskUsage();
    setInterval(logDiskUsage, CHECK_INTERVAL_MS);
}
