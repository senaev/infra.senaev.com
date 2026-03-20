import { existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import {
    CompressionCodecs,
    CompressionTypes,
    Kafka,
    type EachMessagePayload,
    type IHeaders,
} from "kafkajs";
import { join } from "path";
import { KAFKA_BROKERS, TORRENT_FILES_DIR } from "./env";

import SnappyCodec = require("kafkajs-snappy");
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const TOPIC = "torrent-files-topic";
const GROUP_ID = "torrent-files-writer";

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function headerToString(value: Buffer | string | undefined): string | undefined {
    if (typeof value === "string") {
        return value;
    }

    if (Buffer.isBuffer(value)) {
        return value.toString("utf8");
    }

    return undefined;
}

function getHeader(headers: IHeaders | undefined, key: string): string | undefined {
    const value = headers?.[key];
    if (Array.isArray(value)) {
        return headerToString(value[0]);
    }
    return headerToString(value);
}

function getTargetPath(fileName: string): string {
    const sanitized = sanitizeFileName(fileName);
    const basePath = join(TORRENT_FILES_DIR, sanitized);

    if (!existsSync(basePath)) {
        return basePath;
    }

    const lastDotIndex = sanitized.lastIndexOf(".");
    const basename = lastDotIndex > 0 ? sanitized.slice(0, lastDotIndex) : sanitized;
    const extension = lastDotIndex > 0 ? sanitized.slice(lastDotIndex) : "";

    for (let suffix = 1; ; suffix += 1) {
        const candidate = join(TORRENT_FILES_DIR, `${basename}-${suffix}${extension}`);
        if (!existsSync(candidate)) {
            return candidate;
        }
    }
}

function writeTorrentFile(buffer: Buffer, fileName: string): string {
    if (!existsSync(TORRENT_FILES_DIR)) {
        mkdirSync(TORRENT_FILES_DIR, { recursive: true });
    }

    const targetPath = getTargetPath(fileName);
    const tempPath = `${targetPath}.part`;
    writeFileSync(tempPath, buffer);
    renameSync(tempPath, targetPath);
    return targetPath;
}

async function main(): Promise<void> {
    const kafka = new Kafka({ brokers: KAFKA_BROKERS });
    const consumer = kafka.consumer({ groupId: GROUP_ID });

    console.log(`👉 Connecting to Kafka brokers=[${KAFKA_BROKERS.join(",")}]`);
    await consumer.connect();
    console.log("✅ Connected to Kafka brokers");

    console.log(`👉 Subscribing to Kafka topic=[${TOPIC}]`);
    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
    console.log(`✅ Subscribed to topic=[${TOPIC}]`);

    console.log("👉 Running Kafka consumer");
    await consumer.run({
        eachMessage: async ({ topic, message }: EachMessagePayload) => {
            try {
                if (topic !== TOPIC) {
                    throw new Error(`Received message from unexpected topic=[${topic}]`);
                }

                if (!message.value) {
                    throw new Error("Received torrent file message with no value");
                }

                const fileName = getHeader(message.headers, "fileName");
                if (!fileName) {
                    throw new Error("Received torrent file message with no fileName header");
                }

                const path = writeTorrentFile(message.value, fileName);
                console.log(`✅ Wrote torrent file to path=[${path}]`);
            } catch (error) {
                console.error("❌ Failed to process torrent file message", {
                    topic,
                    offset: message.offset,
                    fileName: getHeader(message.headers, "fileName"),
                    error,
                });
                throw error;
            }
        },
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
