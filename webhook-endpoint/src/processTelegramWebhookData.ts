import { isObject } from "senaev-utils/src/utils/Object/isObject";
import { TelegramMessage, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { OBSIDIAN_TASKS_CHAT_ID, TG_CLUSTER_CHAT_ID, TG_MEDIA_SERVER_CHAT_ID } from "./env";
import { IGNORED_CHATS_WHITELIST } from "./ignoredChatsWhitelist";
import { logger } from "./logger";
import { processClusterChatMessage } from "./processClusterChatMessage";
import {
    processMediaServerCallbackQuery,
    TelegramCallbackQuery,
} from "./processMediaServerCallbackQuery";
import { processMediaServerChatMessage } from "./processMediaServerChatMessage";
import { processTasksChatMessage } from "./processTasksChatMessage";

export async function processTelegramWebhookData({
    botUser,
    update,
}: {
    botUser: TelegramUser;
    update: Record<string, unknown>;
}): Promise<void> {
    logger.info("👉 processTelegramWebhookData");
    const { callback_query, message } = update;

    if (isObject(callback_query)) {
        const { message } = callback_query;
        if (!isObject(message) || !isObject(message.chat)) {
            throw new Error("❌ Telegram callback query has no message chat information");
        }

        const chatIdStr = String(message.chat.id);
        if (chatIdStr !== TG_MEDIA_SERVER_CHAT_ID) {
            throw new Error(
                `❌ Received Telegram callback query from unexpected chat id=[${chatIdStr}]`,
            );
        }

        logger.info(
            { callbackQueryId: callback_query.id },
            "🆕 Received callback query in media server chat",
        );
        await processMediaServerCallbackQuery({
            callbackQuery: callback_query as unknown as TelegramCallbackQuery,
        });
        return;
    }

    if (!isObject(message)) {
        throw new Error(
            `❌ Unsupported Telegram update type received in Webhook Data topic [${JSON.stringify(update)}]`,
        );
    }

    const { chat, from } = message;

    if (!isObject(from)) {
        throw new Error("❌ Telegram message has no sender information");
    }

    const senderId = from.id;
    if (!senderId) {
        throw new Error("❌ Telegram message sender has no id");
    }

    if (senderId === botUser.id) {
        logger.info("🤖 Ignoring message sent by the bot itself");
        return;
    }

    if (!isObject(chat)) {
        throw new Error("❌ Telegram message has no chat information");
    }

    const chatIdStr = String(chat.id);
    if (!chatIdStr) {
        throw new Error("❌ Telegram message chat has no id");
    }

    if (chatIdStr === TG_MEDIA_SERVER_CHAT_ID) {
        logger.info(
            { messageId: message.message_id },
            "🆕 Received new message in media server chat",
        );
        await processMediaServerChatMessage({
            botUser,
            message: message as TelegramMessage,
        });
        return;
    }

    if (chatIdStr === TG_CLUSTER_CHAT_ID) {
        logger.info({ messageId: message.message_id }, "🆕 Received new message in cluster chat");
        processClusterChatMessage(message as TelegramMessage);
        return;
    }

    if (chatIdStr === OBSIDIAN_TASKS_CHAT_ID) {
        logger.info({ messageId: message.message_id }, "🆕 Received new message in tasks chat");
        await processTasksChatMessage(message as TelegramMessage);
        return;
    }

    const ignoredChatName = IGNORED_CHATS_WHITELIST.get(chatIdStr);
    if (ignoredChatName) {
        logger.info(
            { messageId: message.message_id },
            `🔕 Ignoring message from whitelisted chat [${ignoredChatName}]`,
        );
        return;
    }

    throw new Error(`❌ Received Telegram message from unexpected chat id=[${chat.id}]`);
}
