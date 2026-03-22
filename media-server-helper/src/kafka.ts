import { CompressionCodecs, CompressionTypes, Kafka, type IHeaders } from "kafkajs";
import { KAFKA_BROKERS } from "./env";

import SnappyCodec = require("kafkajs-snappy");
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const GROUP_ID = "media-server-helper";
const TOPIC = "torrent-files-topic";

function headerToString(value: Buffer | string | undefined): string | undefined {
    if (typeof value === "string") {
        return value;
    }

    if (Buffer.isBuffer(value)) {
        return value.toString("utf8");
    }

    return undefined;
}

export function getHeader(headers: IHeaders | undefined, key: string): string | undefined {
    const value = headers?.[key];
    if (Array.isArray(value)) {
        return headerToString(value[0]);
    }
    return headerToString(value);
}

export async function runKafkaConsumer(
    writeFile: (buffer: Buffer, fileName: string) => string,
): Promise<void> {
    const kafka = new Kafka({ brokers: KAFKA_BROKERS });
    const consumer = kafka.consumer({ groupId: GROUP_ID });

    console.log(`👉 Connecting to Kafka brokers=[${KAFKA_BROKERS.join(",")}]`);
    await consumer.connect();
    console.log("✅ Connected to Kafka brokers");

    console.log(`👉 Subscribing to Kafka topic=[${TOPIC}]`);
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    console.log(`✅ Subscribed to topic=[${TOPIC}]`);

    console.log("👉 Running Kafka consumer");
    await consumer.run({
        eachMessage: async ({ topic: messageTopic, message }) => {
            try {
                console.log(`🆕 New message in topic=[${messageTopic}]`);

                if (messageTopic !== TOPIC) {
                    throw new Error(`Received message from unexpected topic=[${messageTopic}]`);
                }

                if (!message.value) {
                    throw new Error("Received torrent file message with no value");
                }

                const fileName = getHeader(message.headers, "fileName");
                if (!fileName) {
                    throw new Error("Received torrent file message with no fileName header");
                }

                console.log("👉 Processing torrent file message");
                const path = writeFile(message.value, fileName);
                console.log(`✅ Wrote torrent file to path=[${path}]`);
            } catch (error) {
                console.error("❌ Failed to process torrent file message", {
                    topic: messageTopic,
                    offset: message.offset,
                    fileName: getHeader(message.headers, "fileName"),
                    error,
                });
                throw error;
            }
        },
    });
    console.log("✅ Kafka consumer is running");
}
