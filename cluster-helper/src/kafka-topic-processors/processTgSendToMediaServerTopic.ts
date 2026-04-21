import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "../env";
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
        throw new Error("❌ Consumed message with no value from Tg Send topic");
    }

    const raw = value.toString();

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        await sendTelegramMessage({
            text: raw,
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            token: TG_TOKEN_SENAEV_COM_BOT,
        });
        return;
    }

    if (isTorrentEvent(parsed)) {
        await sendTelegramMessage({
            text: formatTorrentEvent(parsed),
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            parseMode: "HTML",
            token: TG_TOKEN_SENAEV_COM_BOT,
        });
        return;
    }

    await sendTelegramMessage({
        text: raw,
        chatId: TG_MEDIA_SERVER_CHAT_ID,
        token: TG_TOKEN_SENAEV_COM_BOT,
    });
}
