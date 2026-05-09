function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const TG_TOKEN_SENAEV_COM_BOT = requireEnv("TG_TOKEN_SENAEV_COM_BOT");
export const TG_MEDIA_SERVER_CHAT_ID = requireEnv("TG_MEDIA_SERVER_CHAT_ID");
export const TG_CLUSTER_CHAT_ID = requireEnv("TG_CLUSTER_CHAT_ID");
