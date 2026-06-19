import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { isObject } from "senaev-utils/src/utils/Object/isObject";
import { callTelegramApi } from "senaev-utils/src/utils/TelegramApi/callTelegramApi";
import { getCurrentTelegramBotInfo } from "senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo";
import { TelegramUpdate, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { ALISA_WEBHOOK_SECRET, TG_TOKEN_SENAEV_COM_BOT, WEBHOOK_DOMAIN } from "./env";
import { handleAlisaRequest } from "./handleAlisaRequest";
import { logger } from "./logger";
import { processTelegramWebhookData } from "./processTelegramWebhookData";
import { startTorrentOutboxProcessor, stopTorrentOutboxProcessor } from "./torrentOutbox";

export const PORT = 3000;
export const TELEGRAM_WEBHOOK_PATH = "/telegram-webhook";

export const webhookSecretToken = randomBytes(32).toString("hex");

const server = Fastify({ loggerInstance: logger });

server.get("/healthz", async (_request, reply) => {
    return reply.send("OK");
});

server.get("/*", async (request, reply) => {
    return reply.code(401).send("Unauthorized");
});

server.post(`/${ALISA_WEBHOOK_SECRET}`, async ({ body }, reply) => {
    const responseText = await handleAlisaRequest(body as Record<string, unknown>);

    return reply.send({
        version: "1.0",
        response: {
            text: responseText,
            end_session: true,
        },
    });
});

async function main(): Promise<void> {
    const botUser: TelegramUser = await getCurrentTelegramBotInfo(TG_TOKEN_SENAEV_COM_BOT);
    logger.info({ botUser }, "✅ Bot user");

    server.post(TELEGRAM_WEBHOOK_PATH, async (request, reply) => {
        try {
            logger.info({ update: request.body }, "🆕 Received Telegram update");
            const secret = request.headers["x-telegram-bot-api-secret-token"];
            if (secret !== webhookSecretToken) {
                logger.warn(
                    { path: TELEGRAM_WEBHOOK_PATH },
                    "⚠️ Unauthorized request with invalid secret token",
                );
                return reply.code(401).send("Unauthorized");
            }

            const update = request.body;
            if (!isObject(update)) {
                logger.warn(
                    { path: TELEGRAM_WEBHOOK_PATH, bodyType: typeof update, body: update },
                    "⚠️ Invalid request with non-object body",
                );
                return reply.code(400).send("Bad Request");
            }

            await processTelegramWebhookData({
                botUser,
                update: update as TelegramUpdate,
            });

            logger.info("✅ Successfully processed Telegram update");
            return reply.send("OK");
        } catch (err: unknown) {
            logger.error(err, "❌ Error processing Telegram webhook data");
            // Telegram retries non-2xx webhook responses, so acknowledge after logging.
            return reply.send("OK");
        }
    });

    await startTorrentOutboxProcessor();
    logger.info("✅ Torrent outbox processor started");

    await server.listen({ port: PORT, host: "0.0.0.0" });
    logger.info({ port: PORT }, "✅ Server listening");

    const webhookUrl = `https://${WEBHOOK_DOMAIN}${TELEGRAM_WEBHOOK_PATH}`;
    await callTelegramApi({
        method: "setWebhook",
        token: TG_TOKEN_SENAEV_COM_BOT,
        body: {
            url: webhookUrl,
            secret_token: webhookSecretToken,
            allowed_updates: ["message", "channel_post", "callback_query"],
        },
    });
    logger.info({ webhookUrl }, "✅ Webhook set");
}

async function shutdown(): Promise<void> {
    logger.info("🛑 Shutting down");
    await server.close();
    stopTorrentOutboxProcessor();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err: unknown) => {
    logger.error(err, "❌ Failed to start server");
    process.exit(1);
});
