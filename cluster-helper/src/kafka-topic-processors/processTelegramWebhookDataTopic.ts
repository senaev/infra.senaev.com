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
    } else {
        console.error("🤔 Received Telegram update other than channel_post");
    }
}
