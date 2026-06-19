import Fastify from "fastify";
import { getCurrentTelegramBotInfo } from "senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { handleAlertmanagerWebhook } from "./alerts/handleAlertmanagerWebhook";
import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { formatTorrentEvent, isTorrentEvent } from "./qbittorrent/formatTorrentEvent";
import { logger } from "./logger";

const HOST = "0.0.0.0";
const PORT = 80;

const server = Fastify({ loggerInstance: logger });
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
    logger.info({ body: request.body }, "🆕 Received Telegram send message request");
    await sendTelegramMessage({
        ...(request.body as Omit<Parameters<typeof sendTelegramMessage>[0], "token">),
        token: TG_TOKEN_SENAEV_COM_BOT,
    });
    reply.code(204).send();
});

server.post<{ Body: unknown }>("/qbittorrent/torrent-event", async (request, reply) => {
    logger.info({ body: request.body }, "🆕 Received qBittorrent torrent event");
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

async function main(): Promise<void> {
    await getCurrentTelegramBotInfo(TG_TOKEN_SENAEV_COM_BOT);

    await server.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, "✅ Cluster helper listening");

    isReady = true;
    logger.info("✅ Cluster helper is ready");
}

process.on("SIGTERM", async () => {
    process.exit(0);
});

process.on("SIGINT", async () => {
    process.exit(0);
});

main().catch((err) => {
    logger.error(err, "❌ Failed to start server");
    process.exit(1);
});
