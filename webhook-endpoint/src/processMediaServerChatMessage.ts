import { downloadFileFromTelegramMessage } from "senaev-utils/src/utils/TelegramApi/downloadFileFromTelegramMessage";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { prettyStringify } from "senaev-utils/src/utils/prettyStringify";
import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { getTelegramCommandFromMessage } from "./getTelegramCommandFromMessage/getTelegramCommandFromMessage";
import { enqueueTorrentFile } from "./torrentOutbox";

async function processMediaServerChatMessageInternal({
    botUser,
    message,
}: {
    botUser: TelegramUser;
    message: TelegramMessage;
}): Promise<{
    emoji: string;
}> {
    const { text } = message;

    if (text) {
        const command = getTelegramCommandFromMessage(text);

        if (command) {
            const { commandName, botName, commandArgument } = command;

            if (botName !== undefined && botName !== botUser.username) {
                console.error(
                    `❌ The bot=[${botName}] for the command is wrong, it should be [${botUser.username}]`,
                );
                return {
                    emoji: "🤷",
                };
            }

            if (command.commandName !== "torrent") {
                console.error(`❌ Unknown command=[${commandName}]`);
                return {
                    emoji: "🤷",
                };
            }

            console.log(`👉 Received torrent command text=[${message.text}]`);
            await sendTelegramMessage({
                text: prettyStringify({ commandName, botName, commandArgument }),
                chatId: TG_MEDIA_SERVER_CHAT_ID,
                token: TG_TOKEN_SENAEV_COM_BOT,
            });
            console.log("✅ Sent torrent command acknowledgement");

            return {
                emoji: "👍",
            };
        }
    }

    if (!message.document) {
        console.error("❌ No documents (torrent files)");
        return {
            emoji: "🤷",
        };
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

    return {
        emoji: "👍",
    };
}

export async function processMediaServerChatMessage({
    botUser,
    message,
}: {
    botUser: TelegramUser;
    message: TelegramMessage;
}): Promise<void> {
    console.log("👉 Start processing message in processMediaServerChatMessage");
    const { emoji } = await processMediaServerChatMessageInternal({
        botUser,
        message,
    });
    console.log(`✅ Finish processing message in processMediaServerChatMessage, emoji=[${emoji}]`);

    console.log(`👉 Setting reaction to the message...`);
    await setTelegramMessageReaction({
        chatId: message.chat.id,
        messageId: message.message_id,
        token: TG_TOKEN_SENAEV_COM_BOT,
        reactions: [emoji],
    });
    console.log(`✅ Sent reaction to the message`);
}
