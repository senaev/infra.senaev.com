import Fastify from "fastify";
import { Kafka, type EachMessagePayload } from "kafkajs";
import { KAFKA_BROKERS, TG_CLUSTER_CHAT_ID, TG_MEDIA_SERVER_CHANNEL_ID } from "./env";
import { formatTorrentEvent, isTorrentEvent } from "./qbittorrent/formatTorrentEvent";
import { getMe, sendTelegramMessage } from "./telegram/api";
import { processMediaServerChannelPost } from "./telegram/processMediaServerChannelPost";
import type { TelegramUpdate } from "./telegram/types";

function escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

const HOST = "0.0.0.0";
const PORT = 80;

const server = Fastify({ logger: true });
server.get("/*", async (_request, reply) => {
    reply.send("server OK");
});

export const TELEGRAM_WEBHOOK_KAFKA_TOPIC = "telegram-webhook-data-topic";
export const TG_SEND_TO_MEDIA_SERVER_KAFKA_TOPIC = "tg-send-to-media-server-topic";
export const VAULT_UNSEAL_KAFKA_TOPIC = "vault-unseal-topic";

async function handleTgSendToMediaServerChat(raw: string): Promise<void> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        await sendTelegramMessage({
            text: raw,
            chatId: TG_MEDIA_SERVER_CHANNEL_ID,
        });
        return;
    }

    if (isTorrentEvent(parsed)) {
        await sendTelegramMessage({
            text: formatTorrentEvent(parsed),
            chatId: TG_MEDIA_SERVER_CHANNEL_ID,
            parseMode: "HTML",
        });
        return;
    }

    await sendTelegramMessage({ text: raw, chatId: TG_MEDIA_SERVER_CHANNEL_ID });
}

async function main(): Promise<void> {
    const botUser = await getMe();

    const kafka = new Kafka({ brokers: KAFKA_BROKERS });
    const consumer = kafka.consumer({ groupId: "cluster-helper" });

    await consumer.connect();
    await consumer.subscribe({
        topic: TELEGRAM_WEBHOOK_KAFKA_TOPIC,
        fromBeginning: false,
    });
    await consumer.subscribe({
        topic: TG_SEND_TO_MEDIA_SERVER_KAFKA_TOPIC,
        fromBeginning: false,
    });
    await consumer.subscribe({
        topic: VAULT_UNSEAL_KAFKA_TOPIC,
        fromBeginning: false,
    });

    await consumer.run({
        eachMessage: async ({ topic, message }: EachMessagePayload) => {
            if (!message.value) {
                console.error("Consumed message with no value");
                return;
            }

            console.log(`New message in topic=[${topic}] message.length=[${message.value.length}]`);

            if (topic === TG_SEND_TO_MEDIA_SERVER_KAFKA_TOPIC) {
                await handleTgSendToMediaServerChat(message.value.toString());
                console.log("✅ Message sent to Telegram Media Server Channel");
                return;
            }

            if (topic === VAULT_UNSEAL_KAFKA_TOPIC) {
                const token = JSON.parse(message.value.toString());
                await sendTelegramMessage({
                    text: `New vault unseal token:\n||${escapeMarkdownV2(JSON.stringify(token, null, 2))}||`,
                    chatId: TG_CLUSTER_CHAT_ID,
                    parseMode: "MarkdownV2",
                });
                console.log("✅ Vault unseal token sent to Telegram Cluster Chat");
                return;
            }

            if (topic === TELEGRAM_WEBHOOK_KAFKA_TOPIC) {
                const update = JSON.parse(message.value.toString()) as TelegramUpdate;
                const post = update.channel_post;
                if (post) {
                    await processMediaServerChannelPost(post, botUser.id);
                    console.log("✅ Processed Telegram channel post");
                    return;
                } else {
                    console.error("🤔 Received Telegram update other than channel_post");
                }
            }

            console.error(`Received message for unknown topic=[${topic}]`);
        },
    });

    await server.listen({ port: PORT, host: HOST });
    console.log(`[cluster-helper] listening on port ${PORT}`);

    await sendTelegramMessage({
        text: "🟢 Cluster helper is ready",
        chatId: TG_MEDIA_SERVER_CHANNEL_ID,
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
