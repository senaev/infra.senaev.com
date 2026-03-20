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
        console.log(`new message: ${JSON.stringify(message, null, 2)}`);
        return;
    }

    throw new Error("❌ Unsupported Telegram update type received in Webhook Data topic");
}
