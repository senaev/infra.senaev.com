import { downloadFileFromTelegramMessage } from "senaev-utils/src/utils/TelegramApi/downloadFileFromTelegramMessage";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { enqueueTorrentFile } from "./torrentOutbox";

export async function processMediaServerChatMessage({
    botUser,
    message,
}: {
    botUser: TelegramUser;
    message: TelegramMessage;
}): Promise<void> {
    await setTelegramMessageReaction({
        chatId: message.chat.id,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["👀"],
    });

    // const { text } = message;

    // // if (text) {
    // //     const command = getTelegramCommandFromMessage(text);

    // //     if (command) {
    // //         const { commandName, botName } = command;

    // //         if (botName !== undefined && botName !== botUser.username)

    // //         if (command.commandName === "torrent" && isCommandForBot(command, botUser)) {
    // //             console.log(`👉 Received torrent command text=[${message.text}]`);
    // //             await sendTelegramMessage({
    // //                 text: "OK",
    // //                 chatId: TG_MEDIA_SERVER_CHAT_ID,
    // //                 token: TG_TOKEN_SENAEV_COM_BOT,
    // //             });
    // //             console.log("✅ Sent torrent command acknowledgement");
    // //             return;
    // //         }
    // //     }
    // // }

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
        `✅ Downloaded file from Telegram, size=[${buffer.length}] bytes, storing in torrent outbox...`,
    );

    console.log(`📥 Queueing torrent file with fileName=[${fileName}]`);
    const outboxItemId = await enqueueTorrentFile({
        buffer,
        fileName,
    });
    console.log(`✅ File stored in torrent outbox successfully, id=[${outboxItemId}]`);

    console.log(`👉 Setting thumbs up reaction to the message...`);
    await setTelegramMessageReaction({
        chatId: message.chat.id,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: ["👍"],
    });
    console.log(`✅ Thumbs up reaction set successfully`);
}
