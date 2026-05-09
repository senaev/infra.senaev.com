import Fastify from "fastify";
import { CompressionCodecs, CompressionTypes, Kafka, type EachMessagePayload } from "kafkajs";
import { getCurrentTelegramBotInfo } from "senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { handleAlertmanagerWebhook } from "./alerts/handleAlertmanagerWebhook";
import { KAFKA_BROKERS, TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { KafkaTopicProcessorArgument } from "./kafka-topic-processors/KafkaTopicProcessorArgument";
import { processTgSendTopic } from "./kafka-topic-processors/processTgSendTopic";
import { formatTorrentEvent, isTorrentEvent } from "./qbittorrent/formatTorrentEvent";

import SnappyCodec = require("kafkajs-snappy");
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

const HOST = "0.0.0.0";
const PORT = 80;

const server = Fastify();
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

server.post<{ Body: unknown }>("/telegram/send-message", async (request, reply) => {
    console.log("🆕 Received Telegram send message request:", request.body);
    await sendTelegramMessage({
        ...(request.body as Omit<Parameters<typeof sendTelegramMessage>[0], "token">),
        token: TG_TOKEN_SENAEV_COM_BOT,
    });
    reply.code(204).send();
});

server.post<{ Body: unknown }>("/qbittorrent/torrent-event", async (request, reply) => {
    console.log("🆕 Received qBittorrent torrent event:", request.body);
    if (!isTorrentEvent(request.body)) {
        throw new Error("Invalid qBittorrent torrent event payload");
    }

    await sendTelegramMessage({
        text: formatTorrentEvent(request.body),
        chatId: TG_MEDIA_SERVER_CHAT_ID,
        parseMode: "HTML",
        token: TG_TOKEN_SENAEV_COM_BOT,
    });
    reply.code(204).send();
});

const KAFKA_TOPIC_HANDLERS: Record<
    string,
    (message: KafkaTopicProcessorArgument) => Promise<void>
> = {
    "tg-send-topic": processTgSendTopic,
};

async function main(): Promise<void> {
    const botUser: TelegramUser = await getCurrentTelegramBotInfo(TG_TOKEN_SENAEV_COM_BOT);

    console.log("👉 Connecting Kafka producer");
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
    process.exit(0);
});

process.on("SIGINT", async () => {
    process.exit(0);
});

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
