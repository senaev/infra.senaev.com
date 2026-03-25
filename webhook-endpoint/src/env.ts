function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const TG_TOKEN_SENAEV_COM_BOT = requireEnv("TG_TOKEN_SENAEV_COM_BOT");
export const WEBHOOK_DOMAIN = requireEnv("WEBHOOK_DOMAIN");
export const KAFKA_BROKERS = requireEnv("KAFKA_BROKERS").split(",");
export const ALISA_WEBHOOK_SECRET = requireEnv("ALISA_WEBHOOK_SECRET");
export const OPENROUTER_API_KEY = requireEnv("OPENROUTER_API_KEY");
