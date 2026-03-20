import { TG_CLUSTER_CHAT_ID } from "../env";
import { sendTelegramMessage } from "../telegram/api";
import { processMediaServerChannelPost } from "../telegram/processMediaServerChannelPost";
import { TelegramUpdate } from "../telegram/types";
import { KafkaTopicProcessorArgument } from "./KafkaTopicProcessorArgument";

export async function processTelegramWebhookDataTopic({
    message: { value },
    botUser,
}: KafkaTopicProcessorArgument): Promise<void> {
    if (!value) {
        console.error("❌ Consumed message with no value from Telegram Webhook Data topic");
        return;
    }

    const update = JSON.parse(value.toString()) as TelegramUpdate;
    const post = update.channel_post;
    if (post) {
        await processMediaServerChannelPost(post, botUser.id);
        console.log("✅ Processed Telegram channel post");
        return;
    }

    const message = update.message;
    if (message) {
        const { text, chat } = message;

        if (!chat) {
            throw new Error("❌ Telegram message has no chat information");
        }

        if (!text) {
            throw new Error("❌ Received Telegram message with no text content");
        }

        if (String(chat.id) !== TG_CLUSTER_CHAT_ID) {
            throw new Error(`❌ Received Telegram message from unexpected chat id=[${chat.id}]`);
        }

        sendTelegramMessage({
            chatId: TG_CLUSTER_CHAT_ID,
            text: `🤷 Don't know how to answer to your message`,
        });
        console.log("✅ Processed Telegram message");
        return;
    }

    throw new Error("❌ Unsupported Telegram update type received in Webhook Data topic");
}
