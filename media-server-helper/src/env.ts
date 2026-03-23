function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function requirePercentEnv(name: string): number {
    const rawValue = requireEnv(name);
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`Invalid percent environment variable: ${name}=${rawValue}`);
    }
    return value;
}

export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS").split(",");
export const TELEGRAM_BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
export const TG_MEDIA_SERVER_CHANNEL_ID = requireEnv("TG_MEDIA_SERVER_CHANNEL_ID");
export const PERCENT_TRIGGER_TO_REMOVE = requirePercentEnv("PERCENT_TRIGGER_TO_REMOVE");
export const PERCENT_REMOVE_TARGET = requirePercentEnv("PERCENT_REMOVE_TARGET");
