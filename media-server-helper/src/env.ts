function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS").split(",");
export const TELEGRAM_BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
export const TG_MEDIA_SERVER_CHANNEL_ID = requireEnv("TG_MEDIA_SERVER_CHANNEL_ID");
