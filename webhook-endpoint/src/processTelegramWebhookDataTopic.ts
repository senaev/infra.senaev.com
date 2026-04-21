import { TG_CLUSTER_CHAT_ID, TG_MEDIA_SERVER_CHAT_ID } from "../../cluster-helper/src/env";
import { processClusterChatMessage } from "../../cluster-helper/src/telegram/processClusterChatMessage";
import { processMediaServerChatMessage } from "../../cluster-helper/src/telegram/processMediaServerChatMessage";
import { TelegramUpdate } from "../../cluster-helper/src/telegram/types";

export async function processTelegramWebhookData({
    message: { value },
    botUser,
}: KafkaTopicProcessorArgument): Promise<void> {
    if (!value) {
        throw new Error("❌ Consumed message with no value from Telegram Webhook Data topic");
    }

    const update = JSON.parse(value.toString()) as TelegramUpdate;
    const message = update.message;

    if (!message) {
        throw new Error(
            `❌ Unsupported Telegram update type received in Webhook Data topic [${JSON.stringify(update)}]`,
        );
    }

    const { chat, from } = message;

    if (!from) {
        throw new Error("❌ Telegram message has no sender information");
    }

    const senderId = from.id;
    if (!senderId) {
        throw new Error("❌ Telegram message sender has no id");
    }

    if (senderId === botUser.id) {
        console.error("🤖 Ignoring message sent by the bot itself");
        return;
    }

    if (!chat) {
        throw new Error("❌ Telegram message has no chat information");
    }

    const chatIdStr = String(chat.id);
    if (!chatIdStr) {
        throw new Error("❌ Telegram message chat has no id");
    }

    if (chatIdStr === TG_MEDIA_SERVER_CHAT_ID) {
        processMediaServerChatMessage(message);
        return;
    }

    if (chatIdStr === TG_CLUSTER_CHAT_ID) {
        processClusterChatMessage(message);
        return;
    }

    throw new Error(`❌ Received Telegram message from unexpected chat id=[${chat.id}]`);
}
