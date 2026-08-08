import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { TG_TOKEN_SENAEV_COM_BOT } from "../env";
import { logger } from "../logger";
import type { ResolvedEmbed } from "../telegram-post-sync/render/resolveImageEmbeds";

// Verified empirically on 2026-08-08 — the Bot API documents no error strings at all, so
// this substring is the only way to recognise a no-op edit. Full message:
// "Bad Request: message is not modified: specified new message content and reply markup
//  are exactly the same as a current content and reply markup of the message"
const NOT_MODIFIED = "message is not modified";

const MAX_RATE_LIMIT_RETRIES = 3;

type TelegramResponse = {
    ok: boolean;
    description?: string;
    error_code?: number;
    parameters?: { retry_after?: number };
};

export type EditRichMessageResult = "updated" | "unchanged";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildForm(
    chatId: string,
    messageId: number,
    markdown: string,
    media: ResolvedEmbed[],
): Promise<FormData> {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("message_id", String(messageId));

    const richMessage = {
        markdown,
        ...(media.length > 0 && {
            media: media.map(({ id }) => ({
                id,
                media: { type: "photo", media: `attach://${id}_file` },
            })),
        }),
    };
    form.append("rich_message", JSON.stringify(richMessage));

    for (const { id, absolutePath } of media) {
        const bytes = await readFile(absolutePath);
        form.append(`${id}_file`, new Blob([bytes]), basename(absolutePath));
    }

    return form;
}

/**
 * Rewrites an existing channel post with rich-message content.
 *
 * Requires the bot to be a channel administrator with `can_edit_messages`, which is what
 * allows it to edit posts it did not author.
 *
 * Re-sending identical content is a no-op that Telegram rejects with "message is not
 * modified"; that is reported as `"unchanged"` rather than thrown, because the sync
 * deliberately re-pushes every tracked note on startup.
 */
export async function editTelegramRichMessage({
    chatId,
    messageId,
    markdown,
    media,
}: {
    chatId: string;
    messageId: number;
    markdown: string;
    media: ResolvedEmbed[];
}): Promise<EditRichMessageResult> {
    const url = `https://api.telegram.org/bot${TG_TOKEN_SENAEV_COM_BOT}/editMessageText`;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
        // The body is rebuilt per attempt because a FormData containing Blobs can't be
        // reliably reused once consumed by fetch.
        const response = await fetch(url, {
            method: "POST",
            body: await buildForm(chatId, messageId, markdown, media),
        });
        const result = (await response.json()) as TelegramResponse;

        if (result.ok) {
            return "updated";
        }

        const description = result.description ?? "unknown error";

        if (description.includes(NOT_MODIFIED)) {
            return "unchanged";
        }

        const retryAfter = result.parameters?.retry_after;
        if (result.error_code === 429 && retryAfter !== undefined && attempt < MAX_RATE_LIMIT_RETRIES) {
            logger.warn({ chatId, messageId, retryAfter }, "⏳ Rate limited, retrying");
            await sleep(retryAfter * 1000);
            continue;
        }

        throw new Error(`editMessageText failed for ${chatId}/${messageId}: ${description}`);
    }

    throw new Error(`editMessageText gave up after ${MAX_RATE_LIMIT_RETRIES} rate-limit retries`);
}
