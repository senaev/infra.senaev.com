import { createTelegramApiBaseUrl } from './createTelegramApiBaseUrl';
import { TelegramApiResponse } from './types';

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
    parseMode?: 'HTML' | 'MarkdownV2';
}): Promise<void> {
    const telegramApiBaseUrl = createTelegramApiBaseUrl(token);
    const formData = new FormData();

    formData.append('chat_id', chatId);
    formData.append('document', new Blob([content], { type: 'application/json' }), filename);

    if (caption) {
        formData.append('caption', caption);
    }

    if (parseMode) {
        formData.append('parse_mode', parseMode);
    }

    const res = await fetch(`${telegramApiBaseUrl}/sendDocument`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();

        throw new Error(`Telegram sendDocument HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as TelegramApiResponse<unknown>;

    if (!data.ok || data.result === undefined) {
        throw new Error(`Telegram sendDocument failed: ${data.description ?? 'unknown error'}`);
    }
}
