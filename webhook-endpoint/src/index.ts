import Fastify from "fastify";
import { randomBytes } from "node:crypto";
import { ALISA_WEBHOOK_SECRET, WEBHOOK_DOMAIN } from "./env.js";
import { connectProducer, disconnectProducer, sendMessage } from "./kafka-producer.js";
import { processAlisaCommand } from "./processAlisaCommand.js";
import { telegramApiCall } from "./telegram-api.js";

export const PORT = 3000;
export const WEBHOOK_PATH = "/telegram-webhook";
export const KAFKA_TOPIC = "telegram-webhook-data-topic";

export const webhookSecretToken = randomBytes(32).toString("hex");

const server = Fastify({ logger: true });

server.get("/*", async (request, reply) => {
    return reply.code(401).send("Unauthorized");
});

server.post(WEBHOOK_PATH, async (request, reply) => {
    console.log("🆕 Received Telegram update:", request.body);
    const secret = request.headers["x-telegram-bot-api-secret-token"];
    if (secret !== webhookSecretToken) {
        console.log(`❌ Unauthorized request=[${WEBHOOK_PATH}] with invalid secret token`);
        return reply.code(401).send("Unauthorized");
    }

    await sendMessage(KAFKA_TOPIC, JSON.stringify(request.body));
    return reply.send("OK");
});

server.post(`/${ALISA_WEBHOOK_SECRET}`, async ({ body }, reply) => {
    if (!body) {
        throw new Error("Missing request body");
    }

    const { request } = body as Record<string, unknown>;
    if (!request) {
        throw new Error("Missing request field in body");
    }

    const { command } = request as Record<string, unknown>;

    if (typeof command !== "string") {
        throw new Error("Missing command field in request");
    }

    return reply.send({
        version: "1.0",
        response: {
            text: await processAlisaCommand(command),
            end_session: false,
        },
    });
});

async function main(): Promise<void> {
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
