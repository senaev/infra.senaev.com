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
        throw new Error("❌ Consumed message with no value from Telegram Webhook Data topic");
    }

    const update = JSON.parse(value.toString()) as TelegramUpdate;
    const post = update.channel_post;
    if (post) {
        console.log(
            `👉 Processing Telegram channel post with id=[${post.message_id}] from chat id=[${post.chat.id}]`,
        );
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

        console.log(
            `👉 Received Telegram message with id=[${message.message_id}] in cluster chat from user id=[${message.from?.id}]`,
        );
        await sendTelegramMessage({
            chatId: TG_CLUSTER_CHAT_ID,
            text: `🤷 Don't know how to answer to your message`,
            replyToMessageId: message.message_id,
        });
        console.log("✅ Processed Telegram message");
        return;
    }

    throw new Error("❌ Unsupported Telegram update type received in Webhook Data topic");
}
