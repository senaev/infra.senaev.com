import { OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID } from "./env";

export type TrickyDadSource = "Tricky Dad" | "Obsidian Tasks" | "Alisa";

export const TRICKY_DAD_SOURCE_TO_CHAT_ID: Record<TrickyDadSource, string | null> = {
    "Tricky Dad": TRICKY_DAD_CHAT_ID,
    "Obsidian Tasks": OBSIDIAN_TASKS_CHAT_ID,
    "Alisa": null, // Alisa has no Telegram source chat
};