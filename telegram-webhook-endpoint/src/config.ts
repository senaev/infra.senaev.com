import { randomBytes } from "node:crypto";

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
export const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN!;
export const KAFKA_BROKERS = process.env.KAFKA_BROKERS!;
export const KAFKA_TOPIC = process.env.KAFKA_TOPIC!;

export const PORT = 3000;
export const WEBHOOK_PATH = "/telegram-webhook";
export const MAX_BODY_SIZE = 1_000_000;

export const webhookSecretToken = randomBytes(32).toString("hex");
