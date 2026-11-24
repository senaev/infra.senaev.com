import { OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID } from '../env';

import { ADD_SHOPPING_ITEMS_ACTION } from './actions/addShoppingItems';
import { ADD_REMINDERS_ACTION } from './actions/addReminders';
import type { TrickyDadAction } from './actions/TrickyDadAction';

export type TrickyDadSource = 'Tricky Dad Telegram chat' | 'Tasks Telegram chat' | 'Alisa';

export type TrickyDadSourceConfig = {
    /** The Telegram chat of the source, or null for a source without one (Alisa). */
    chatId: string | null;
    /**
     * The only action of the source: the model only fills its arguments, and the raw command
     * goes to it when no LLM provider gives a usable answer.
     */
    action: TrickyDadAction;
};

// Reminders and shopping are separate on purpose: a source never chooses between them, so a
// shopping request cannot become a reminder, and the Tasks chat never writes to the shopping list.
export const TRICKY_DAD_SOURCES: Record<TrickyDadSource, TrickyDadSourceConfig> = {
    'Tricky Dad Telegram chat': {
        chatId: TRICKY_DAD_CHAT_ID,
        action: ADD_SHOPPING_ITEMS_ACTION,
    },
    'Tasks Telegram chat': {
        chatId: OBSIDIAN_TASKS_CHAT_ID,
        action: ADD_REMINDERS_ACTION,
    },
    Alisa: {
        chatId: null,
        action: ADD_SHOPPING_ITEMS_ACTION,
    },
};
