import { TG_MEDIA_SERVER_CHANNEL_ID } from "../env";
import { sendMessage as sendKafkaMessage } from "../kafka/producer";
import { downloadFile, sendTelegramMessage, setMessageReaction } from "./api";
import type { ReactionCount, TelegramMessage } from "./types";

const TORRENT_FILES_TOPIC = "torrent-files-topic";
const EYES_REACTION = "👀";
const THUMBS_UP_REACTION = "👍";

function hasEyesReaction(reaction?: ReactionCount[]): boolean {
    if (!reaction || !Array.isArray(reaction)) return false;
    return reaction.some((r) => r.type?.type === "emoji" && r.type?.emoji === EYES_REACTION);
}

export async function processMediaServerChannelPost(
    message: TelegramMessage,
    botUserId: number,
): Promise<void> {
    if (message.from?.id === botUserId) {
        console.error("❌ Processing message is from bot");
        return;
    }
    const chatIdStr = String(message.chat.id);
    if (chatIdStr !== TG_MEDIA_SERVER_CHANNEL_ID) {
        console.error(`❌ Processing message is from another channel=[${chatIdStr}]`);
        return;
    }
    if (hasEyesReaction(message.reaction)) {
        console.error(`❌ Processed message is already processed`);
        return;
    }

    await setMessageReaction(message.chat.id, message.message_id, [EYES_REACTION]);

    if (!message.document) {
        console.error(`❌ Processed message has no documents`);
        await sendTelegramMessage({
            text: "Sorry, I can only process documents (torrent files) 🤷",
            chatId: TG_MEDIA_SERVER_CHANNEL_ID,
        });
        console.log("✅ Sent message about unsupported content type");
        return;
    }

    const fileName = message.document.file_name ?? message.document.file_id;
    const buffer = Buffer.from(await downloadFile(message.document.file_id));
    await sendKafkaMessage(TORRENT_FILES_TOPIC, buffer, {
        fileName,
        telegramFileId: message.document.file_id,
        telegramMessageId: String(message.message_id),
        telegramChatId: String(message.chat.id),
    });
    await setMessageReaction(message.chat.id, message.message_id, [THUMBS_UP_REACTION]);
}
