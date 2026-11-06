import { OBSIDIAN_TASKS_CHAT_ID, TRICKY_DAD_CHAT_ID } from '../env';

import { ADD_SHOPPING_ITEMS_ACTION } from './actions/addShoppingItems';
import { ADD_TASKS_ACTION } from './actions/addTasks';
import type { TrickyDadAction } from './actions/TrickyDadAction';

export type TrickyDadSource = 'Tricky Dad' | 'Obsidian Tasks' | 'Alisa';

export type TrickyDadSourceConfig = {
    /** The Telegram chat of the source, or null for a source without one (Alisa). */
    chatId: string | null;
    /**
     * The actions that the model may choose for this source. A source with one action skips
     * the choice: the model only fills the arguments.
     */
    actions: TrickyDadAction[];
    /** Gets the raw command when the model gives no usable answer, so nothing is lost. */
    fallbackAction: TrickyDadAction;
};

export const TRICKY_DAD_SOURCES: Record<TrickyDadSource, TrickyDadSourceConfig> = {
    'Tricky Dad': {
        chatId: TRICKY_DAD_CHAT_ID,
        actions: [
            ADD_TASKS_ACTION,
            ADD_SHOPPING_ITEMS_ACTION,
        ],
        fallbackAction: ADD_SHOPPING_ITEMS_ACTION,
    },
    // Task-only on purpose: this chat must never write to the shopping list.
    'Obsidian Tasks': {
        chatId: OBSIDIAN_TASKS_CHAT_ID,
        actions: [ADD_TASKS_ACTION],
        fallbackAction: ADD_TASKS_ACTION,
    },
    Alisa: {
        chatId: null,
        actions: [
            ADD_TASKS_ACTION,
            ADD_SHOPPING_ITEMS_ACTION,
        ],
        fallbackAction: ADD_SHOPPING_ITEMS_ACTION,
    },
};
