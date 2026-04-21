import { downloadFileFromTelegramMessage } from "senaev-utils/src/utils/TelegramApi/downloadFileFromTelegramMessage";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "../env";
import { sendMessage as sendKafkaMessage } from "../kafka/producer";

const TORRENT_FILES_TOPIC = "torrent-files-topic";

export async function processMediaServerChatMessage(message: TelegramMessage): Promise<void> {
    await setTelegramMessageReaction({
        chatId: message.chat.id,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["👀"],
    });

    if (!message.document) {
        console.error(`❌ Processed message has no documents`);
        await sendTelegramMessage({
            text: "Sorry, I can only process documents (torrent files) 🤷",
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            token: TG_TOKEN_SENAEV_COM_BOT,
        });
        console.log("✅ Sent message about unsupported content type");
        return;
    }

    const fileName = message.document.file_name ?? message.document.file_id;
    console.log(
        `📥 Processing new document message with fileName=[${fileName}] from Telegram channel`,
    );
    const buffer = Buffer.from(
        await downloadFileFromTelegramMessage({
            fileId: message.document.file_id,
            token: TG_TOKEN_SENAEV_COM_BOT,
        }),
    );
    console.log(
        `✅ Downloaded file from Telegram, size=[${buffer.length}] bytes, sending to Kafka topic...`,
    );

    console.log(
        `📤 Sending file to Kafka topic [${TORRENT_FILES_TOPIC}] with metadata: fileName=[${fileName}], telegramFileId=[${message.document.file_id}], telegramMessageId=[${message.message_id}], telegramChatId=[${message.chat.id}]`,
    );
    await sendKafkaMessage(TORRENT_FILES_TOPIC, buffer, {
        fileName,
        telegramFileId: message.document.file_id,
        telegramMessageId: String(message.message_id),
        telegramChatId: String(message.chat.id),
    });
    console.log(`✅ File sent to Kafka topic [${TORRENT_FILES_TOPIC}] successfully`);

    console.log(`👉 Setting thumbs up reaction to the message...`);
    await setTelegramMessageReaction({
        chatId: message.chat.id,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["👍"],
    });
    console.log(`✅ Thumbs up reaction set successfully`);
}
