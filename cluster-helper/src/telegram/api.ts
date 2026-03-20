import { TOKEN_senaev_com_bot } from "../env";
import type {
  ReactionTypeEmoji,
  TelegramApiResponse,
  TelegramUser,
} from "./types";

const BASE = `https://api.telegram.org/bot${TOKEN_senaev_com_bot}`;
const FILE_BASE = `https://api.telegram.org/file/bot${TOKEN_senaev_com_bot}`;

async function callApi<T>(method: string, body?: object): Promise<T> {
  const res = await fetch(
    `${BASE}/${method}`,
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
    throw new Error(
      `Telegram ${method} failed: ${data.description ?? "unknown error"}`,
    );
  }

  return data.result;
}

export async function sendTelegramMessage({
  text,
  chatId,
  parseMode,
  replyToMessageId,
  replyMarkup,
}: {
  text: string;
  chatId: string;
  parseMode?: "HTML" | "MarkdownV2";
  replyToMessageId?: number;
  replyMarkup?: {
    inline_keyboard: Array<
      Array<
        | {
            text: string;
            copy_text: {
              text: string;
            };
          }
      >
    >;
  };
}): Promise<void> {
  await callApi("sendMessage", {
    chat_id: chatId,
    text,
    ...(parseMode && { parse_mode: parseMode }),
    ...(replyMarkup && { reply_markup: replyMarkup }),
    ...(replyToMessageId && {
      reply_parameters: { message_id: replyToMessageId },
    }),
  });
}

export async function getMe(): Promise<TelegramUser> {
  return callApi<TelegramUser>("getMe");
}

export async function setMessageReaction(
  chatId: string | number,
  messageId: number,
  reaction: ReactionTypeEmoji[],
): Promise<void> {
  await callApi("setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction,
  });
}

export async function getFile(fileId: string): Promise<{ file_path: string }> {
  const result = await callApi<{ file_path: string; file_id: string }>(
    "getFile",
    {
      file_id: fileId,
    },
  );
  return { file_path: result.file_path };
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const { file_path } = await getFile(fileId);
  const res = await fetch(`${FILE_BASE}/${file_path}`);
  if (!res.ok) throw new Error(`downloadFile failed: ${res.status}`);
  return res.arrayBuffer();
}
