import { startDiskSpaceMonitor } from "./disk-space-monitor/diskSpaceMonitor";
import { runTorrentFileReceiver } from "./torrentFileReceiver";
import { writeTorrentFile } from "./torrentFileStorage";

async function main(): Promise<void> {
    startDiskSpaceMonitor();
    await runTorrentFileReceiver(writeTorrentFile);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
