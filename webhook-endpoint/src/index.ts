import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { isObject } from "senaev-utils/src/utils/Object/isObject";
import { getCurrentTelegramBotInfo } from "senaev-utils/src/utils/TelegramApi/getCurrentTelegramBotInfo";
import { TelegramUpdate, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { ALISA_WEBHOOK_SECRET, TG_TOKEN_SENAEV_COM_BOT, WEBHOOK_DOMAIN } from "./env.js";
import { handleAlisaRequest } from "./handleAlisaRequest.js";
import { connectProducer, disconnectProducer } from "./kafka-producer.js";
import { processTelegramWebhookData } from "./processTelegramWebhookData.js";
import { telegramApiCall } from "./telegram-api.js";

export const PORT = 3000;
export const WEBHOOK_PATH = "/telegram-webhook";

export const webhookSecretToken = randomBytes(32).toString("hex");

const server = Fastify();

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
    server.post(WEBHOOK_PATH, async (request, reply) => {
        try {
            console.log("🆕 Received Telegram update:", request.body);
            const secret = request.headers["x-telegram-bot-api-secret-token"];
            if (secret !== webhookSecretToken) {
                console.log(`❌ Unauthorized request=[${WEBHOOK_PATH}] with invalid secret token`);
                return reply.code(401).send("Unauthorized");
            }

            const update = request.body;
            if (!isObject(update)) {
                console.log(
                    `❌ Invalid request=[${WEBHOOK_PATH}] with non-object body=[${typeof update}][${update}]`,
                );
                return reply.code(400).send("Bad Request");
            }

            await processTelegramWebhookData({
                botUser,
                update: update as TelegramUpdate,
            });

            console.log(`✅ Successfully processed Telegram update`);
            return reply.send("OK");
        } catch (err: unknown) {
            console.error("❌ Error processing Telegram webhook data:", err);
            return reply.code(500).send("Internal Server Error");
        }
    });

    await connectProducer();
    console.log(`✅ Connected to Kafka`);

    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`✅ Server listening on port=${PORT}`);

    const webhookUrl = `https://${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
    await telegramApiCall("setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecretToken,
        allowed_updates: ["message", "channel_post"],
    });
    console.log(`✅ Webhook set to url=${webhookUrl}`);
}

async function shutdown(): Promise<void> {
    console.log("Shutting down...");
    await server.close();
    await disconnectProducer();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
