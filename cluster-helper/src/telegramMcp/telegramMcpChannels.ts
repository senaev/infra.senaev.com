import {
    JOB_SEARCH_FRAMEWORK_CHAT_ID,
    OBSIDIAN_TASKS_CHAT_ID,
    TG_CLUSTER_CHAT_ID,
    TG_MEDIA_SERVER_CHAT_ID,
    TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID,
    TG_VPN_SUBSCRIPTION_CHAT_ID,
    TRICKY_DAD_CHAT_ID,
} from '../env';

import type { TelegramMcpChannel } from './telegramToolFamily';

/**
 * The only chats that the /telegram MCP endpoint can post to, by name. The senaev.com bot
 * must be a member (an admin in a channel) of each one.
 */
export const TELEGRAM_MCP_CHANNELS: readonly TelegramMcpChannel[] = [
    {
        name: 'owner',
        description: 'the private chat with the owner, Andrei',
        chatId: TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID,
    },
    {
        name: 'cluster',
        description: 'cluster alerts and operational notifications',
        chatId: TG_CLUSTER_CHAT_ID,
    },
    {
        name: 'media-server',
        description: 'the media server: torrents, downloads, movies and series',
        chatId: TG_MEDIA_SERVER_CHAT_ID,
    },
    {
        name: 'vpn-subscription',
        description: 'the chat of the VPN subscription service',
        chatId: TG_VPN_SUBSCRIPTION_CHAT_ID,
    },
    {
        name: 'obsidian-tasks',
        description: 'the tasks chat, where messages to the bot become reminders in the Obsidian vault',
        chatId: OBSIDIAN_TASKS_CHAT_ID,
    },
    {
        name: 'tricky-dad',
        description: 'the Tricky Dad chat, where messages to the bot become shopping items and reminders',
        chatId: TRICKY_DAD_CHAT_ID,
    },
    {
        name: 'job-search-framework',
        description: 'the Job Search Framework chat: job search recommendations of the LLM job search rounds',
        chatId: JOB_SEARCH_FRAMEWORK_CHAT_ID,
    },
];
