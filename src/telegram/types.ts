export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}

export interface ReactionTypeEmoji {
  type: "emoji";
  emoji: string;
}

export interface ReactionCount {
  type: ReactionTypeEmoji;
  total_count: number;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  date: number;
  text?: string;
  from?: TelegramUser;
  reaction?: ReactionCount[];
  document?: TelegramFile;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface GetMeResult {
  ok: boolean;
  result: TelegramUser;
}

export interface GetFileResult {
  ok: boolean;
  result?: { file_path: string; file_id: string };
}
