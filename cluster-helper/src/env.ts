import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

export const TG_TOKEN_SENAEV_COM_BOT = requireEnv('TG_TOKEN_SENAEV_COM_BOT');
export const TG_MEDIA_SERVER_CHAT_ID = requireEnv('TG_MEDIA_SERVER_CHAT_ID');
export const TG_CLUSTER_CHAT_ID = requireEnv('TG_CLUSTER_CHAT_ID');
export const API_DOMAIN = requireEnv('API_DOMAIN');
/** Comma-separated Yandex user IDs (session.user.user_id) that the Alisa webhook accepts. */
export const ALISA_ALLOWED_USER_IDS = requireEnv('ALISA_ALLOWED_USER_IDS');
export const AUTH_DOMAIN = requireEnv('AUTH_DOMAIN');
export const MCP_DOMAIN = requireEnv('MCP_DOMAIN');
export const AUTH_TOKEN_SIGNING_SECRET = requireEnv('AUTH_TOKEN_SIGNING_SECRET');
export const GOOGLE_OAUTH_CLIENT_ID = requireEnv('GOOGLE_OAUTH_CLIENT_ID');
export const GOOGLE_OAUTH_CLIENT_SECRET = requireEnv('GOOGLE_OAUTH_CLIENT_SECRET');
/** Comma-separated Gmail addresses that may sign in with Google. */
export const GOOGLE_OAUTH_ADMIN_EMAILS = requireEnv('GOOGLE_OAUTH_ADMIN_EMAILS');
export const OPENROUTER_API_KEY = requireEnv('OPENROUTER_API_KEY');
/** Optional: Helm sets it only when the home llm-server is enabled. */
export const LLM_SERVER_URL = process.env.LLM_SERVER_URL || null;
export const GROQ_API_KEY = requireEnv('GROQ_API_KEY');
export const SUPABASE_PROJECT_URL = requireEnv('SUPABASE_PROJECT_URL');
export const SUPABASE_PUBLISHABLE_KEY = requireEnv('SUPABASE_PUBLISHABLE_KEY');
export const PROWLARR_URL = requireEnv('PROWLARR_URL');
export const PROWLARR_CONFIG_FILE = requireEnv('PROWLARR_CONFIG_FILE');
export const TG_VPN_SUBSCRIPTION_CHAT_ID = requireEnv('TG_VPN_SUBSCRIPTION_CHAT_ID');
export const OBSIDIAN_TASKS_CHAT_ID = requireEnv('OBSIDIAN_TASKS_CHAT_ID');
export const TRICKY_DAD_CHAT_ID = requireEnv('TRICKY_DAD_CHAT_ID');
export const JOB_SEARCH_FRAMEWORK_CHAT_ID = requireEnv('JOB_SEARCH_FRAMEWORK_CHAT_ID');
/** The streamable-HTTP endpoint of mcp-grafana, which the /grafana MCP endpoint proxies to. */
export const MCP_GRAFANA_URL = requireEnv('MCP_GRAFANA_URL');
export const TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID = requireEnv('TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID');
/** The bearer secret of the public thin proxy to the Bot API of the senaev.com bot. */
export const TELEGRAM_PUBLIC_API_SECRET = requireEnv('TELEGRAM_PUBLIC_API_SECRET');
