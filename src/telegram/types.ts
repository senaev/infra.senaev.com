export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
}

export interface TelegramChat {
  id: number
  type: string
  title?: string
}

export interface ReactionTypeEmoji {
  type: "emoji"
  emoji: string
}

export interface ReactionCount {
  type: ReactionTypeEmoji
  total_count: number
}

export interface TelegramMessage {
  message_id: number
  chat: TelegramChat
  date: number
  text?: string
  from?: TelegramUser
  reaction?: ReactionCount[]
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
}

export interface GetMeResult {
  ok: boolean
  result: TelegramUser
}

export interface GetUpdatesResult {
  ok: boolean
  result: TelegramUpdate[]
}
