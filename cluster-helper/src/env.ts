import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

export const TG_TOKEN_SENAEV_COM_BOT = requireEnv('TG_TOKEN_SENAEV_COM_BOT');
export const TG_MEDIA_SERVER_CHAT_ID = requireEnv('TG_MEDIA_SERVER_CHAT_ID');
export const TG_CLUSTER_CHAT_ID = requireEnv('TG_CLUSTER_CHAT_ID');
export const WEBHOOK_DOMAIN = requireEnv('WEBHOOK_DOMAIN');
export const ALISA_WEBHOOK_SECRET = requireEnv('ALISA_WEBHOOK_SECRET');
export const AUTH_DOMAIN = requireEnv('AUTH_DOMAIN');
export const MCP_DOMAIN = requireEnv('MCP_DOMAIN');
export const AUTH_MY_USERNAME = requireEnv('AUTH_MY_USERNAME');
export const AUTH_MY_PASSWORD = requireEnv('AUTH_MY_PASSWORD');
export const AUTH_TOKEN_SIGNING_SECRET = requireEnv('AUTH_TOKEN_SIGNING_SECRET');
export const OPENROUTER_API_KEY = requireEnv('OPENROUTER_API_KEY');
export const GROQ_API_KEY = requireEnv('GROQ_API_KEY');
export const SUPABASE_PROJECT_URL = requireEnv('SUPABASE_PROJECT_URL');
export const SUPABASE_PUBLISHABLE_KEY = requireEnv('SUPABASE_PUBLISHABLE_KEY');
export const PROWLARR_URL = requireEnv('PROWLARR_URL');
export const PROWLARR_CONFIG_FILE = requireEnv('PROWLARR_CONFIG_FILE');
export const TG_VPN_SUBSCRIPTION_CHAT_ID = requireEnv('TG_VPN_SUBSCRIPTION_CHAT_ID');
export const OBSIDIAN_TASKS_CHAT_ID = requireEnv('OBSIDIAN_TASKS_CHAT_ID');
export const TRICKY_DAD_CHAT_ID = requireEnv('TRICKY_DAD_CHAT_ID');
export const OBSIDIAN_SYNC_URL = requireEnv('OBSIDIAN_SYNC_URL');
export const INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN = requireEnv('INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN');
/** code-tools runs in the opencode-serve container and serves the code-* MCP tools. */
export const CODE_TOOLS_URL = requireEnv('CODE_TOOLS_URL');
export const INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS = requireEnv('INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS');
export const TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID = requireEnv('TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID');
