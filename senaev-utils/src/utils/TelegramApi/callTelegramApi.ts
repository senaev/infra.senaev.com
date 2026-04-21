import { createTelegramApiBaseUrl } from './createTelegramApiBaseUrl';
import { TelegramApiResponse } from './types';

export async function callTelegramApi<T>({
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
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }
            : undefined
    );

    if (!res.ok) {
        const text = await res.text();

        throw new Error(`Telegram ${method} HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as TelegramApiResponse<T>;

    if (!data.ok || data.result === undefined) {
        throw new Error(`Telegram ${method} failed: ${data.description ?? 'unknown error'}`);
    }

    return data.result;
}
