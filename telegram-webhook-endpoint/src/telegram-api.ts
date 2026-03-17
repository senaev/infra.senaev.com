import { TELEGRAM_BOT_TOKEN } from "./env.js";

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

export async function telegramApiCall(
  method: string,
  payload: Record<string, unknown>,
): Promise<TelegramResponse> {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
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
    throw new Error(
      `Telegram API ${method} returned error: ${data.description ?? "unknown"}`,
    );
  }

  return data;
}
