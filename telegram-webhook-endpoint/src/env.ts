function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const TELEGRAM_BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
export const WEBHOOK_DOMAIN = requireEnv("WEBHOOK_DOMAIN");
export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS").split(",");
export const KAFKA_TOPIC = requireEnv("KAFKA_TOPIC");
