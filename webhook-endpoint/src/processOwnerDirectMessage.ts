import { getTelegramCommandFromMessage } from "senaev-utils/src/utils/TelegramApi/getTelegramCommandFromMessage/getTelegramCommandFromMessage";
import { sendTelegramMessage } from "senaev-utils/src/utils/TelegramApi/sendTelegramMessage";
import { TelegramMessage } from "senaev-utils/src/utils/TelegramApi/types";
import { TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";
import { logger } from "./logger";
import { createShortLink } from "./obsidianSyncApi";

const SHORT_LINK_BASE_URL = "https://s.senaev.com";

/** Handles direct messages sent by the owner to the bot's private chat. */
export async function processOwnerDirectMessage(message: TelegramMessage): Promise<void> {
    const command = getTelegramCommandFromMessage(message.text ?? "");

    if (!command || command.commandName !== "short_link") {
        logger.info(
            { text: message.text },
            "🔕 Ignoring unrecognized message in owner direct message chat",
        );
        await replyToOwner(message, "❌ Unknown command. Usage: /short_link <url>");
        return;
    }

    await handleShortLinkCommand(command.commandArgument, message);
}

async function handleShortLinkCommand(link: string, message: TelegramMessage): Promise<void> {
    if (!link) {
        await replyToOwner(message, "❌ Usage: /short_link <url>");
        return;
    }

    try {
        logger.info({ link }, "👉 Creating short link");
        const id = await createShortLink(link);
        logger.info({ id }, "✅ Created short link");
        await replyToOwner(message, `${SHORT_LINK_BASE_URL}/${id}`);
    } catch (err: unknown) {
        logger.error(err, "❌ Failed to create short link");
        const errorText = err instanceof Error ? err.message : String(err);
        await replyToOwner(message, `❌ ${errorText}`);
    }
}

async function replyToOwner(message: TelegramMessage, text: string): Promise<void> {
    await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: TG_SENAEV_COM_BOT_DIRECT_MESSAGE_WITH_OWNER_CHAT_ID,
        text,
        replyToMessageId: message.message_id,
    });
}
