import Fastify from "fastify";
import { CompressionCodecs, CompressionTypes, Kafka, type EachMessagePayload } from "kafkajs";
import { handleAlertmanagerWebhook } from "./alerts/handleAlertmanagerWebhook";
import { KAFKA_BROKERS } from "./env";
import { KafkaTopicProcessorArgument } from "./kafka-topic-processors/KafkaTopicProcessorArgument";
import { processQbittorrentWebuiPasswordTopic } from "./kafka-topic-processors/processQbittorrentWebuiPasswordTopic";
import { processTelegramWebhookDataTopic } from "./kafka-topic-processors/processTelegramWebhookDataTopic";
import { processTgSendToMediaServerTopic } from "./kafka-topic-processors/processTgSendToMediaServerTopic";
import { connectProducer, disconnectProducer } from "./kafka/producer";
import { getMe } from "./telegram/api";
import type { TelegramUser } from "./telegram/types";

import SnappyCodec = require("kafkajs-snappy");
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const HOST = "0.0.0.0";
const PORT = 80;

const server = Fastify({ logger: true });
let isReady = false;

server.get("/health/live", async (_request, reply) => {
    reply.code(200).send({ status: "ok" });
});

server.get("/health/ready", async (_request, reply) => {
    if (!isReady) {
        reply.code(503).send({ status: "not-ready" });
        return;
    }

    reply.code(200).send({ status: "ready" });
});

server.post<{ Body: unknown }>("/alertmanager/webhook", async (request, reply) => {
    handleAlertmanagerWebhook(request.body);

    reply.code(204).send();
});

const KAFKA_TOPIC_HANDLERS: Record<
    string,
    (message: KafkaTopicProcessorArgument) => Promise<void>
> = {
    "telegram-webhook-data-topic": processTelegramWebhookDataTopic,
    "qbittorrent-webui-password-topic": processQbittorrentWebuiPasswordTopic,
    "tg-send-to-media-server-topic": processTgSendToMediaServerTopic,
};

async function main(): Promise<void> {
    const botUser: TelegramUser = await getMe();

    console.log("👉 Connecting Kafka producer");
    await connectProducer();
    console.log("✅ Connected Kafka producer");

    const kafka = new Kafka({ brokers: KAFKA_BROKERS });
    const consumer = kafka.consumer({ groupId: "cluster-helper" });

    console.log(`👉 Connecting to Kafka brokers=[${KAFKA_BROKERS.join(",")}`);
    await consumer.connect();
    console.log("✅ Connected to Kafka brokers");

    console.log(`👉 Subscribing to Kafka topics=[${Object.keys(KAFKA_TOPIC_HANDLERS).join(",")}]`);
    await Promise.all(
        Object.keys(KAFKA_TOPIC_HANDLERS).map((topic) =>
            consumer.subscribe({ topic, fromBeginning: true }).then(() => {
                console.log(`✅ Subscribed to topic=[${topic}]`);
            }),
        ),
    );

    console.log("👉 Running Kafka consumer");
    await consumer.run({
        eachMessage: async ({ topic, message }: EachMessagePayload) => {
            console.log(
                `🆕 New message in topic=[${topic}] message.length=[${message.value?.length}]`,
            );
            const kafkaTopicProcessorArgument = { message, botUser };

            const handler = KAFKA_TOPIC_HANDLERS[topic];
            if (!handler) {
                console.error(`❌ Received message for unknown topic=[${topic}]`);
                return;
            }

            try {
                await handler(kafkaTopicProcessorArgument);
            } catch (err) {
                console.error(`❌ Error processing message from topic=[${topic}]`, err);
            }
        },
    });
    console.log("✅ Kafka consumer is running");

    await server.listen({ port: PORT, host: HOST });
    console.log(`✅ [cluster-helper] listening on port=[${PORT}]`);

    console.log("✅ Cluster helper is ready");

    isReady = true;
}

process.on("SIGTERM", async () => {
    await disconnectProducer();
    process.exit(0);
});

process.on("SIGINT", async () => {
    await disconnectProducer();
    process.exit(0);
});

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
