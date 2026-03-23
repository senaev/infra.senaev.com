import { TG_MEDIA_SERVER_CHANNEL_ID, TG_TOKEN_SENAEV_COM_BOT } from "./env";

type TelegramApiResponse<T> = {
    ok: boolean;
    result?: T;
    description?: string;
};

const BASE_URL = `https://api.telegram.org/bot${TG_TOKEN_SENAEV_COM_BOT}`;

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function callTelegramApi<T>(method: string, body: object): Promise<T> {
    const response = await fetch(`${BASE_URL}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Telegram ${method} HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as TelegramApiResponse<T>;
    if (!data.ok || data.result === undefined) {
        throw new Error(`Telegram ${method} failed: ${data.description ?? "unknown error"}`);
    }

    return data.result;
}

export async function sendTelegramHtmlMessage(html: string): Promise<void> {
    await callTelegramApi("sendMessage", {
        chat_id: TG_MEDIA_SERVER_CHANNEL_ID,
        text: html,
        parse_mode: "HTML",
    });
}

export { escapeHtml };
