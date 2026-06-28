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
export const WEBHOOK_DOMAIN = requireEnv("WEBHOOK_DOMAIN");
export const ALISA_WEBHOOK_SECRET = requireEnv("ALISA_WEBHOOK_SECRET");
export const OPENROUTER_API_KEY = requireEnv("OPENROUTER_API_KEY");
export const GROQ_API_KEY = requireEnv("GROQ_API_KEY");
export const SUPABASE_PROJECT_URL = requireEnv("SUPABASE_PROJECT_URL");
export const SUPABASE_PUBLISHABLE_KEY = requireEnv("SUPABASE_PUBLISHABLE_KEY");
export const PROWLARR_URL = requireEnv("PROWLARR_URL");
export const PROWLARR_CONFIG_FILE = requireEnv("PROWLARR_CONFIG_FILE");
export const TG_VPN_SUBSCRIPTION_CHAT_ID = requireEnv("TG_VPN_SUBSCRIPTION_CHAT_ID");
export const OBSIDIAN_TASKS_CHAT_ID = requireEnv("OBSIDIAN_TASKS_CHAT_ID");

