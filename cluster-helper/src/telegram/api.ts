import type { TelegramApiResponse, TelegramUser } from "./types";

const createTelegramApiBaseUrl = (token: string) => `https://api.telegram.org/bot${token}`;
const createTelegramApiBaseFileUrl = (token: string) => `https://api.telegram.org/file/bot${token}`;

async function callApi<T>({
    method,
    token,
    body,
}: {
    method: string;
    token: string;
    body?: Record<string, unknown> | undefined;
}): Promise<T> {
    const telegramApiBaseUrl = createTelegramApiBaseUrl(token);
    const res = await fetch(
        `${telegramApiBaseUrl}/${method}`,
        body
            ? {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
              }
            : undefined,
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Telegram ${method} HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as TelegramApiResponse<T>;
    if (!data.ok || data.result === undefined) {
        throw new Error(`Telegram ${method} failed: ${data.description ?? "unknown error"}`);
    }

    return data.result;
}

export type TelegramForwardPayload = {
    method: string;
    token: string;
    body?: Record<string, unknown>;
};

export async function sendTelegramMessage({
    text,
    chatId,
    token,
    parseMode,
    replyToMessageId,
    replyMarkup,
}: {
    text: string;
    chatId: string;
    token: string;
    parseMode?: "HTML" | "MarkdownV2";
    replyToMessageId?: number;
    replyMarkup?: {
        inline_keyboard: Array<
            Array<{
                text: string;
                copy_text: {
                    text: string;
                };
            }>
        >;
    };
}): Promise<{ message_id: number }> {
    return callApi<{ message_id: number }>({
        method: "sendMessage",
        token,
        body: {
            chat_id: chatId,
            text,
            ...(parseMode && { parse_mode: parseMode }),
            ...(replyMarkup && { reply_markup: replyMarkup }),
            ...(replyToMessageId && {
                reply_parameters: { message_id: replyToMessageId },
            }),
        },
    });
}

export async function sendTelegramDocument({
    chatId,
    filename,
    token,
    content,
    caption,
    parseMode,
}: {
    chatId: string;
    filename: string;
    token: string;
    content: string;
    caption?: string;
    parseMode?: "HTML" | "MarkdownV2";
}): Promise<void> {
    const telegramApiBaseUrl = createTelegramApiBaseUrl(token);
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("document", new Blob([content], { type: "application/json" }), filename);

    if (caption) formData.append("caption", caption);
    if (parseMode) formData.append("parse_mode", parseMode);

    const res = await fetch(`${telegramApiBaseUrl}/sendDocument`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Telegram sendDocument HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as TelegramApiResponse<unknown>;
    if (!data.ok || data.result === undefined) {
        throw new Error(`Telegram sendDocument failed: ${data.description ?? "unknown error"}`);
    }
}

export async function getMe(token: string): Promise<TelegramUser> {
    return callApi<TelegramUser>({ method: "getMe", token });
}

export async function forwardTelegramApiCall({
    method,
    body,
    token,
}: TelegramForwardPayload): Promise<unknown> {
    return callApi({ method, body, token });
}

export async function setMessageReaction({
    chatId,
    messageId,
    token,
    reactions,
}: {
    chatId: string | number;
    messageId: number;
    token: string;
    reactions: string[];
}): Promise<void> {
    await callApi({
        method: "setMessageReaction",
        token,
        body: {
            chat_id: chatId,
            message_id: messageId,
            reaction: reactions.map((emoji) => ({ type: "emoji", emoji })),
        },
    });
}

export async function getFile({
    fileId,
    token,
}: {
    fileId: string;
    token: string;
}): Promise<{ file_path: string }> {
    const result = await callApi<{ file_path: string; file_id: string }>({
        method: "getFile",
        token,
        body: {
            file_id: fileId,
        },
    });
    return { file_path: result.file_path };
}

export async function downloadFile({
    fileId,
    token,
}: {
    fileId: string;
    token: string;
}): Promise<ArrayBuffer> {
    const telegramApiBaseFileUrl = createTelegramApiBaseFileUrl(token);
    const { file_path } = await getFile({ fileId, token });
    const res = await fetch(`${telegramApiBaseFileUrl}/${file_path}`);
    if (!res.ok) throw new Error(`downloadFile failed: ${res.status}`);
    return res.arrayBuffer();
}
