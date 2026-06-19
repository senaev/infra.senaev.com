import { startDiskSpaceMonitor } from "./disk-space-monitor/diskSpaceMonitor";
import { logger } from "./logger";
import { runTorrentFileReceiver } from "./torrentFileReceiver";
import { writeTorrentFile } from "./torrentFileStorage";

async function main(): Promise<void> {
    startDiskSpaceMonitor();
    await runTorrentFileReceiver(writeTorrentFile);
}

main().catch((error) => {
    logger.error(error, "❌ Failed to start server");
    process.exit(1);
});
