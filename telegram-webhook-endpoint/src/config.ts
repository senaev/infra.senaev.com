import { randomBytes } from "node:crypto";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const TELEGRAM_BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
export const WEBHOOK_DOMAIN = requireEnv("WEBHOOK_DOMAIN");
export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS");
export const KAFKA_TOPIC = requireEnv("KAFKA_TOPIC");

export const PORT = 3000;
export const WEBHOOK_PATH = "/telegram-webhook";
export const MAX_BODY_SIZE = 1_000_000;

export const webhookSecretToken = randomBytes(32).toString("hex");
