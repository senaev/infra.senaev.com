import Fastify from "fastify";
import { CompressionCodecs, CompressionTypes, Kafka, type EachMessagePayload } from "kafkajs";
import { KAFKA_BROKERS, TG_CLUSTER_CHAT_ID } from "./env";
import { KafkaTopicProcessorArgument } from "./kafka-topic-processors/KafkaTopicProcessorArgument";
import { processQbittorrentWebuiPasswordTopic } from "./kafka-topic-processors/processQbittorrentWebuiPasswordTopic";
import { processTelegramWebhookDataTopic } from "./kafka-topic-processors/processTelegramWebhookDataTopic";
import { processTgSendToMediaServerTopic } from "./kafka-topic-processors/processTgSendToMediaServerTopic";
import { connectProducer, disconnectProducer } from "./kafka/producer";
import { getMe, sendTelegramMessage } from "./telegram/api";
import type { TelegramUser } from "./telegram/types";

import SnappyCodec = require("kafkajs-snappy");
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const HOST = "0.0.0.0";
const PORT = 80;

type AlertmanagerWebhookAlert = {
    status: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    startsAt?: string;
};

type AlertmanagerWebhookPayload = {
    receiver?: string;
    status?: string;
    externalURL?: string;
    alerts?: AlertmanagerWebhookAlert[];
};

const server = Fastify({ logger: true });
server.get("/*", async (_request, reply) => {
    reply.send("🟢 Cluster helper is running");
});
server.post<{ Body: AlertmanagerWebhookPayload }>("/alertmanager/webhook", async (request, reply) => {
    const payload = request.body;
    const alerts = payload.alerts ?? [];

    if (alerts.length === 0) {
        request.log.warn("Received Alertmanager webhook with no alerts");
        reply.code(204).send();
        return;
    }

    for (const alert of alerts) {
        const labels = alert.labels ?? {};
        const annotations = alert.annotations ?? {};
        const summary = annotations.summary ?? labels.alertname ?? "Alert";
        const description = annotations.description ?? "No description";
        const statusIcon = alert.status === "resolved" ? "✅" : "🚨";

        await sendTelegramMessage({
            chatId: TG_CLUSTER_CHAT_ID,
            text: [
                `${statusIcon} ${summary}`,
                `Status: ${alert.status ?? payload.status ?? "unknown"}`,
                `Severity: ${labels.severity ?? "unknown"}`,
                `Alert: ${labels.alertname ?? "unknown"}`,
                `Description: ${description}`,
                payload.externalURL ? `Alertmanager: ${payload.externalURL}` : undefined,
            ]
                .filter((line): line is string => Boolean(line))
                .join("\n"),
        });
    }

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

    await sendTelegramMessage({
        text: "🟢 Cluster helper is ready",
        chatId: TG_CLUSTER_CHAT_ID,
    });
    console.log("✅ Cluster helper is ready");
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
