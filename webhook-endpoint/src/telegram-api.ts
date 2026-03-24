import { TG_TOKEN_SENAEV_COM_BOT } from "./env.js";

interface TelegramResponse {
    ok: boolean;
    description?: string;
}

export async function telegramApiCall(
    method: string,
    payload: Record<string, unknown>,
): Promise<TelegramResponse> {
    const response = await fetch(
        `https://api.telegram.org/bot${TG_TOKEN_SENAEV_COM_BOT}/${method}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
    );

    if (!response.ok) {
        throw new Error(
            `Telegram API ${method} failed: HTTP ${response.status} ${response.statusText}`,
        );
    }

    const data = (await response.json()) as TelegramResponse;

    if (!data.ok) {
        throw new Error(`Telegram API ${method} returned error: ${data.description ?? "unknown"}`);
    }

    return data;
}
