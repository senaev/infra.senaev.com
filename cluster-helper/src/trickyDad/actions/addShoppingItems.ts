import { isNonEmptyArray } from 'senaev-utils/src/utils/Array/isNonEmptyArray/isNonEmptyArray';
import { isNonEmptyString } from 'senaev-utils/src/utils/String/NonEmptyString/NonEmptyString';

import { TRICKY_DAD_CHAT_ID } from '../../env';

import { addItemsToSupabaseGroceryList } from './addItemsToSupabaseGroceryList';
import type { TrickyDadAction } from './TrickyDadAction';

const TYPE = 'add_shopping_items';

export const ADD_SHOPPING_ITEMS_ACTION: TrickyDadAction = {
    type: TYPE,
    whenToUse: [`Use ${TYPE} for everything that no other action covers, both things and actions, including requests to do, remember, schedule or add tasks; do not classify by objects versus actions or majority category.`],
    instructions: [
        'Return every requested entry in items, starting with a capital letter. Preserve all details, including amounts, quantities, units, names and deadlines.',
        'For purchases, use standalone product names without purchase verbs or list-management commands, in any language. Preserve other actions as worded; do not turn them into products.',
    ],
    argsProperties: {
        items: {
            type: 'array',
            items: { type: 'string' },
        },
    },
    parseArgs: ({ items }) => {
        if (!isNonEmptyArray(items)) {
            throw new Error(`${TYPE}: items must be a non-empty array, got [${JSON.stringify(items)}]`);
        }

        const trimmed = items.map((item) => {
            const trimmedItem = isNonEmptyString(item) ? item.trim() : '';

            if (!isNonEmptyString(trimmedItem)) {
                throw new Error(`${TYPE}: every item must be a non-empty string, got [${JSON.stringify(item)}]`);
            }

            return trimmedItem;
        });

        return {
            type: TYPE,
            emoji: '🛒',
            reportChatId: TRICKY_DAD_CHAT_ID,
            entries: trimmed,
            run: async () => {
                await addItemsToSupabaseGroceryList(trimmed);

                return [];
            },
        };
    },
    fromRawCommand: (command) => ADD_SHOPPING_ITEMS_ACTION.parseArgs({ items: [command] }),
};
