import { TG_MEDIA_SERVER_CHANNEL_ID } from "../env";
import { formatTorrentEvent, isTorrentEvent } from "../qbittorrent/formatTorrentEvent";
import { sendTelegramMessage } from "../telegram/api";
import { KafkaTopicProcessorArgument } from "./KafkaTopicProcessorArgument";

/**
 * Handle request from other cluster services to send message to Telegram Media Server Channel.
 */
export async function processTgSendToMediaServerTopic({
    message: { value },
}: KafkaTopicProcessorArgument): Promise<void> {
    if (!value) {
        console.error("❌ Consumed message with no value from Tg Send topic");
        return;
    }

    const raw = value.toString();

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        await sendTelegramMessage({
            text: raw,
            chatId: TG_MEDIA_SERVER_CHANNEL_ID,
        });
        return;
    }

    if (isTorrentEvent(parsed)) {
        await sendTelegramMessage({
            text: formatTorrentEvent(parsed),
            chatId: TG_MEDIA_SERVER_CHANNEL_ID,
            parseMode: "HTML",
        });
        return;
    }

    await sendTelegramMessage({ text: raw, chatId: TG_MEDIA_SERVER_CHANNEL_ID });
}
