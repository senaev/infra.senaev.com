import { startDiskSpaceMonitor } from "./diskSpaceMonitor";
import { runKafkaConsumer } from "./kafka";
import { writeTorrentFile } from "./torrentFileStorage";

async function main(): Promise<void> {
    startDiskSpaceMonitor();
    await runKafkaConsumer(writeTorrentFile);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
