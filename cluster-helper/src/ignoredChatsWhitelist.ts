import { JOB_SEARCH_FRAMEWORK_CHAT_ID, TG_VPN_SUBSCRIPTION_CHAT_ID } from './env';

export const IGNORED_CHATS_WHITELIST = new Map<string, string>([
    [
        TG_VPN_SUBSCRIPTION_CHAT_ID,
        'VPN_SUBSCRIPTION',
    ],
    // The bot only posts there (n8n job search rounds, the Telegram MCP); messages of the owner are not processed yet.
    [
        JOB_SEARCH_FRAMEWORK_CHAT_ID,
        'JOB_SEARCH_FRAMEWORK',
    ],
]);
