import { isObjectOrArray } from 'senaev-utils/src/types/Object/Object';
import { TelegramMessage, TelegramUser } from 'senaev-utils/src/utils/TelegramApi/types';

import { describeTelegramUpdate } from './describeTelegramUpdate';
import {
    OBSIDIAN_TASKS_CHAT_ID,
    TG_CLUSTER_CHAT_ID,
    TG_MEDIA_SERVER_CHAT_ID,
    TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID,
    TRICKY_DAD_CHAT_ID,
} from './env';
import { IGNORED_CHATS_WHITELIST } from './ignoredChatsWhitelist';
import { logger } from './logger';
import { processClusterChatMessage } from './processClusterChatMessage';
import {
    processMediaServerCallbackQuery,
    TelegramCallbackQuery,
} from './processMediaServerCallbackQuery';
import { processMediaServerChatMessage } from './processMediaServerChatMessage';
import type { ObsidianSyncApi } from './obsidianSyncApi';
import { processOwnerDirectMessage } from './processOwnerDirectMessage';
import { processTrickyDadChatMessage } from './trickyDad/processTrickyDadChatMessage';

export async function processTelegramWebhookData({
    botUser,
    update,
    obsidianSyncApi,
}: {
    botUser: TelegramUser;
    update: Record<string, unknown>;
    obsidianSyncApi: Pick<ObsidianSyncApi, 'addObsidianReminders' | 'createShortLink'>;
}): Promise<void> {
    logger.info('👉 processTelegramWebhookData');
    const { callback_query, message } = update;

    if (isObjectOrArray(callback_query)) {
        const { message: callbackMessage } = callback_query;

        if (!isObjectOrArray(callbackMessage) || !isObjectOrArray(callbackMessage.chat)) {
            throw new Error('❌ Telegram callback query has no message chat information');
        }

        const chatIdStr = String(callbackMessage.chat.id);

        if (chatIdStr !== TG_MEDIA_SERVER_CHAT_ID) {
            throw new Error(`❌ Received Telegram callback query from unexpected chat id=[${chatIdStr}]`);
        }

        logger.info(
            { callbackQueryId: callback_query.id },
            '🆕 Received callback query in media server chat'
        );
        await processMediaServerCallbackQuery({
            callbackQuery: callback_query as unknown as TelegramCallbackQuery,
        });

        return;
    }

    if (!isObjectOrArray(message)) {
        throw new Error(`❌ Unsupported Telegram update type received in Webhook Data topic [${JSON.stringify(describeTelegramUpdate(update))}]`);
    }

    const { chat, from } = message;

    if (!isObjectOrArray(from)) {
        throw new Error('❌ Telegram message has no sender information');
    }

    const senderId = from.id;

    if (!senderId) {
        throw new Error('❌ Telegram message sender has no id');
    }

    if (senderId === botUser.id) {
        logger.info('🤖 Ignoring message sent by the bot itself');

        return;
    }

    if (!isObjectOrArray(chat)) {
        throw new Error('❌ Telegram message has no chat information');
    }

    const chatIdStr = String(chat.id);

    if (!chatIdStr) {
        throw new Error('❌ Telegram message chat has no id');
    }

    if (chatIdStr === TG_MEDIA_SERVER_CHAT_ID) {
        logger.info(
            { messageId: message.message_id },
            '🆕 Received new message in media server chat'
        );
        await processMediaServerChatMessage({ message: message as TelegramMessage });

        return;
    }

    if (chatIdStr === TG_CLUSTER_CHAT_ID) {
        logger.info({ messageId: message.message_id }, '🆕 Received new message in cluster chat');
        processClusterChatMessage(message as TelegramMessage);

        return;
    }

    if (chatIdStr === OBSIDIAN_TASKS_CHAT_ID) {
        logger.info({ messageId: message.message_id }, '🆕 Received new message in tasks chat');
        await processTrickyDadChatMessage(message as TelegramMessage, 'Tasks Telegram chat', obsidianSyncApi);

        return;
    }

    if (chatIdStr === TRICKY_DAD_CHAT_ID) {
        logger.info({ messageId: message.message_id }, '🆕 Received new message in tricky dad chat');
        await processTrickyDadChatMessage(message as TelegramMessage, 'Tricky Dad Telegram chat', obsidianSyncApi);

        return;
    }

    if (chatIdStr === TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID) {
        logger.info(
            { messageId: message.message_id },
            '🆕 Received new message in owner direct message chat'
        );
        await processOwnerDirectMessage(message as TelegramMessage, obsidianSyncApi);

        return;
    }

    const ignoredChatName = IGNORED_CHATS_WHITELIST.get(chatIdStr);

    if (ignoredChatName) {
        logger.info(
            { messageId: message.message_id },
            `🔕 Ignoring message from whitelisted chat [${ignoredChatName}]`
        );

        return;
    }

    throw new Error(`❌ Received Telegram message from unexpected chat id=[${chat.id}]`);
}
