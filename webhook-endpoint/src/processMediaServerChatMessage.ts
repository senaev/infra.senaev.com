import { downloadFileFromTelegramMessage } from "senaev-utils/src/utils/TelegramApi/downloadFileFromTelegramMessage";
import { getTelegramCommandFromMessage } from "senaev-utils/src/utils/TelegramApi/getTelegramCommandFromMessage/getTelegramCommandFromMessage";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { setTelegramMessageReaction } from "senaev-utils/src/utils/TelegramApi/setTelegramMessageReaction";
import { TelegramMessage, TelegramUser } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { escapeTelegramMarkdownV2 } from "./escapeTelegramMarkdownV2";
import { searchProwlarr } from "./prowlarr";
import { enqueueTorrentFile } from "./torrentOutbox";
import { createTorrentSearchView } from "./torrentSearchTelegram";

async function processMediaServerChatMessageInternal({
    botUser,
    message,
}: {
    botUser: TelegramUser;
    message: TelegramMessage;
}): Promise<string | undefined> {
    const { text } = message;

    if (text) {
        const command = getTelegramCommandFromMessage(text);

        if (command) {
            const { commandName, botName, commandArgument } = command;

            if (botName !== undefined && botName !== botUser.username) {
                const errorMessage = `❌ The bot=[${botName}] for the command is wrong, it should be [${botUser.username}]`;
                console.error(errorMessage);
                return errorMessage;
            }

            if (command.commandName !== "torrent") {
                const errorMessage = `❌ Unknown command=[${commandName}]`;
                console.error(errorMessage);
                return errorMessage;
            }

            console.log(`👉 Received torrent command text=[${message.text}]`);

            if (!commandArgument) {
                const errorMessage = "❌ Torrent command has no search query";
                console.error(errorMessage);

                return errorMessage;
            }

            console.log(`👉 Searching torrents in Prowlarr, query=[${commandArgument}]`);
            const releases = await searchProwlarr(commandArgument);
            console.log(`✅ Found torrent releases count=[${releases.length}]`);

            const view = createTorrentSearchView({
                page: 0,
                query: commandArgument,
                releases,
            });

            const torrentSearchMessage = {
                token: TG_TOKEN_SENAEV_COM_BOT,
                chatId: TG_MEDIA_SERVER_CHAT_ID,
                parseMode: "MarkdownV2",
                text: view.text,
                replyToMessageId: message.message_id,
            } as const;

            if (view.replyMarkup) {
                await sendTelegramMessage({
                    ...torrentSearchMessage,
                    replyMarkup: view.replyMarkup as unknown as NonNullable<
                        Parameters<typeof sendTelegramMessage>[0]["replyMarkup"]
                    >,
                });
            } else {
                await sendTelegramMessage(torrentSearchMessage);
            }

            console.log(`✅ Sent torrent search results, sessionId=[${view.sessionId}]`);

            return;
        }
    }

    if (!message.document) {
        console.error("❌ No documents (torrent files)");
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

    return;
}

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

    try {
        console.log("👉 Start processing message in processMediaServerChatMessage");
        const responseMessage = await processMediaServerChatMessageInternal({
            botUser,
            message,
        });

        console.log(
            `✅ Finish processing message in processMediaServerChatMessage, responseMessage=[${responseMessage}]`,
        );

        if (responseMessage) {
            console.log(`👉 Send responseMessage=[${responseMessage}]`);
            await sendTelegramMessage({
                token: TG_TOKEN_SENAEV_COM_BOT,
                chatId: TG_MEDIA_SERVER_CHAT_ID,
                parseMode: "MarkdownV2",
                text: escapeTelegramMarkdownV2(responseMessage),
                replyToMessageId: message.message_id,
            });
            console.log(`✅ Sent responseMessage`);
        }
    } catch (error) {
        const errorMessage = `❌ ${error}`;

        console.error("❌ processMediaServerChatMessage error:", error);

        console.log(`👉 Send error message`);
        await sendTelegramMessage({
            token: TG_TOKEN_SENAEV_COM_BOT,
            chatId: TG_MEDIA_SERVER_CHAT_ID,
            parseMode: "MarkdownV2",
            text: escapeTelegramMarkdownV2(errorMessage),
            replyToMessageId: message.message_id,
        });
        console.log(`✅ Send error message`);
    }
}
