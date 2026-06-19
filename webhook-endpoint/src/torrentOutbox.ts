import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { logger } from "./logger";

const MEDIA_SERVER_HELPER_URL = "http://media-server-helper:3000";
const TORRENT_OUTBOX_DIR = "/torrent-outbox";
const RETRY_INTERVAL_MS = 5_000;
const DELIVERY_TIMEOUT_MS = 30_000;

type EnqueueTorrentFileInput = {
    buffer: Buffer;
    fileName: string;
};

let processorAbortController: AbortController | undefined;

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function enqueueTorrentFile(input: EnqueueTorrentFileInput): Promise<string> {
    const id = randomUUID();
    const tempDir = join(TORRENT_OUTBOX_DIR, `.${id}.tmp`);
    const targetDir = join(TORRENT_OUTBOX_DIR, id);

    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, sanitizeFileName(input.fileName)), input.buffer);
    await rename(tempDir, targetDir);

    return id;
}

export async function startTorrentOutboxProcessor(): Promise<void> {
    await mkdir(TORRENT_OUTBOX_DIR, { recursive: true });
    processorAbortController = new AbortController();
    void runTorrentOutboxProcessor(processorAbortController.signal);
}

export function stopTorrentOutboxProcessor(): void {
    processorAbortController?.abort();
    processorAbortController = undefined;
}

async function runTorrentOutboxProcessor(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
        try {
            await processTorrentOutbox();
            await setTimeout(RETRY_INTERVAL_MS, undefined, { signal });
        } catch (error) {
            if (signal.aborted) {
                return;
            }
            logger.error(error, "❌ Failed to process torrent outbox");
        }
    }
}

async function processTorrentOutbox(): Promise<void> {
    const entries = await readdir(TORRENT_OUTBOX_DIR, { withFileTypes: true });
    const itemNames = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort();

    for (const itemName of itemNames) {
        await processTorrentOutboxItem(itemName);
    }
}

async function processTorrentOutboxItem(itemName: string): Promise<void> {
    const itemDir = join(TORRENT_OUTBOX_DIR, itemName);
    const [fileName] = await readdir(itemDir);
    if (!fileName) {
        throw new Error(`Queued torrent item has no file: id=[${itemName}]`);
    }

    const payload = await readFile(join(itemDir, fileName));

    logger.info({ itemName, fileName }, "📤 Sending queued torrent file to media-server-helper");

    const response = await fetch(`${MEDIA_SERVER_HELPER_URL}/torrent-files`, {
        method: "POST",
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            fileName,
            contentBase64: payload.toString("base64"),
        }),
    });

    if (!response.ok) {
        throw new Error(
            `media-server-helper responded with status=[${response.status}] body=[${await response.text()}]`,
        );
    }

    await rm(itemDir, { recursive: true, force: true });
    logger.info({ itemName }, "✅ Delivered queued torrent file and removed outbox item");
}
