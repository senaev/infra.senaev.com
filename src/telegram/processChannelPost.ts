import { setMessageReaction } from "./api"
import type { ReactionCount, TelegramMessage } from "./types"
import { EYES_REACTION } from "./EYES_REACTION"
import { TG_CHANNEL_ID } from "../const/TG_CHANNEL_ID"

function hasEyesReaction(reaction?: ReactionCount[]): boolean {
  if (!reaction || !Array.isArray(reaction)) return false
  return reaction.some(
    (r) => r.type?.type === "emoji" && r.type?.emoji === EYES_REACTION.emoji
  )
}

export async function processChannelPost(
  message: TelegramMessage,
  botUserId: number
): Promise<void> {
  if (message.from?.id === botUserId) return
  const chatIdStr = String(message.chat.id)
  if (chatIdStr !== TG_CHANNEL_ID) return
  if (hasEyesReaction(message.reaction)) return

  console.log(
    "[channel_post] PROCESSING ❗️❗️❗️❗️❗️❗️",
    { message_id: message.message_id, date: message.date, text: message.text }
  )
  await setMessageReaction(message.chat.id, message.message_id, [EYES_REACTION])
}
