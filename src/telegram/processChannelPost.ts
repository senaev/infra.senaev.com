import { writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { setMessageReaction, downloadFile, sendTelegramMessage } from "./api"
import type { ReactionCount, TelegramMessage } from "./types"
import { EYES_REACTION } from "./EYES_REACTION"
import { TG_CHANNEL_ID } from "../const/TG_CHANNEL_ID"

const WATCH_TORRENT_FILES_DIR = process.env.WATCH_TORRENT_FILES_DIR as string
if (typeof WATCH_TORRENT_FILES_DIR !== "string") {
  throw new Error("WATCH_TORRENT_FILES_DIR is not a string")
}

function hasEyesReaction(reaction?: ReactionCount[]): boolean {
  if (!reaction || !Array.isArray(reaction)) return false
  return reaction.some(
    (r) => r.type?.type === "emoji" && r.type?.emoji === EYES_REACTION.emoji
  )
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

export async function processChannelPost(
  message: TelegramMessage,
  botUserId: number
): Promise<void> {
  if (message.from?.id === botUserId) return
  const chatIdStr = String(message.chat.id)
  if (chatIdStr !== TG_CHANNEL_ID) return
  if (hasEyesReaction(message.reaction)) return

  await setMessageReaction(message.chat.id, message.message_id, [EYES_REACTION])

  if (!message.document) {
    await sendTelegramMessage("Sorry, I can only process documents (torrent files) 🤷")
    return
  }

  if (!existsSync(WATCH_TORRENT_FILES_DIR)) {
    mkdirSync(WATCH_TORRENT_FILES_DIR, { recursive: true })
  }

  const fileName = message.document.file_name ?? message.document.file_id
  const buffer = await downloadFile(message.document.file_id)
  const path = join(WATCH_TORRENT_FILES_DIR, safeFileName(fileName))
  writeFileSync(path, Buffer.from(buffer))
}
