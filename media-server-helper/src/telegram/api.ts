import { TG_CHANNEL_ID, TOKEN_senaev_com_bot } from "../env";
import type {
  GetFileResult,
  GetMeResult,
  ReactionTypeEmoji,
  TelegramUser,
} from "./types";

const BASE = `https://api.telegram.org/bot${TOKEN_senaev_com_bot}`;
const FILE_BASE = `https://api.telegram.org/file/bot${TOKEN_senaev_com_bot}`;

export async function sendTelegramMessage(text: string): Promise<void> {
  const res = await fetch(`${BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHANNEL_ID, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${res.status} ${err}`);
  }
}

export async function getMe(): Promise<TelegramUser> {
  const response = await fetch(`${BASE}/getMe`);
  const responseJson = await response.json();
  const data = responseJson as GetMeResult;
  if (!data.ok || !data.result) throw new Error("getMe failed");
  return data.result;
}

export async function setMessageReaction(
  chatId: string | number,
  messageId: number,
  reaction: ReactionTypeEmoji[],
): Promise<void> {
  const res = await fetch(`${BASE}/setMessageReaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reaction }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`setMessageReaction failed: ${res.status} ${err}`);
  }
}

export async function getFile(fileId: string): Promise<{ file_path: string }> {
  const res = await fetch(`${BASE}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = (await res.json()) as GetFileResult;
  if (!data.ok || !data.result?.file_path) throw new Error("getFile failed");
  return { file_path: data.result.file_path };
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const { file_path } = await getFile(fileId);
  const res = await fetch(`${FILE_BASE}/${file_path}`);
  if (!res.ok) throw new Error(`downloadFile failed: ${res.status}`);
  return res.arrayBuffer();
}
