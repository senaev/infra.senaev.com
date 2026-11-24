import { isIsoDay } from 'senaev-utils/src/obsidianReminders/isoDay';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { isNonEmptyArray } from 'senaev-utils/src/utils/Array/isNonEmptyArray/isNonEmptyArray';
import { isNonEmptyString } from 'senaev-utils/src/utils/String/NonEmptyString/NonEmptyString';

import { OBSIDIAN_TASKS_CHAT_ID } from '../../env';
import type { ObsidianReminderInput } from '../../obsidianSyncApi';

import type { PlannedTrickyDadAction, TrickyDadAction } from './TrickyDadAction';

const TYPE = 'add_reminders';

type ReminderWithDate = { title: string; date: string | null };

function planAddReminders(reminders: ReminderWithDate[]): PlannedTrickyDadAction {
    return {
        type: TYPE,
        emoji: '👉',
        reportChatId: OBSIDIAN_TASKS_CHAT_ID,
        entries: reminders.map(({ title }) => title),
        run: async ({ source, obsidianSyncApi }) => {
            await obsidianSyncApi.addObsidianReminders(reminders.map(({ title, date }): ObsidianReminderInput => {
                return {
                    title,
                    date,
                    source,
                };
            }));

            return [];
        },
    };
}

function parseReminder(reminder: unknown): ReminderWithDate {
    if (!isObject(reminder) || Array.isArray(reminder)) {
        throw new Error(`${TYPE}: every reminder must be an object, got [${JSON.stringify(reminder)}]`);
    }

    const { title, date } = reminder;

    const trimmedTitle = isNonEmptyString(title) ? title.trim() : '';

    if (!isNonEmptyString(trimmedTitle)) {
        throw new Error(`${TYPE}: reminder title must be a non-empty string, got [${JSON.stringify(title)}]`);
    }

    if (date !== null && (!isNonEmptyString(date) || !isIsoDay(date))) {
        throw new Error(`${TYPE}: reminder date must be a real YYYY-MM-DD or null, got [${JSON.stringify(date)}]`);
    }

    return {
        title: trimmedTitle,
        date,
    };
}

export const ADD_REMINDERS_ACTION: TrickyDadAction = {
    type: TYPE,
    instructions: [
        'Return each distinct action as a separate entry in reminders; never split a single action. Never return an empty reminders array.',
        'Keep reminder titles as close to the original wording as possible, changing only what is necessary. Never summarize or drop details; every detail must appear in a title.',
        'Preserve names, places, products, services, file names, commands, errors, IDs, numbers, amounts, times and quoted text exactly.',
        'Keep full URLs unchanged in the relevant title; a link applying to the whole message goes into every title.',
        'Extract each relevant date as date (YYYY-MM-DD), or null if absent. A date may be a start date, due date or any other kind; do not assume its meaning. A date applying to the whole message applies to every reminder.',
    ],
    argsProperties: {
        reminders: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    date: {
                        type: [
                            'string',
                            'null',
                        ],
                    },
                },
                required: [
                    'title',
                    'date',
                ],
                additionalProperties: false,
            },
        },
    },
    parseArgs: ({ reminders }) => {
        if (!isNonEmptyArray(reminders)) {
            throw new Error(`${TYPE}: reminders must be a non-empty array, got [${JSON.stringify(reminders)}]`);
        }

        return planAddReminders(reminders.map(parseReminder));
    },
    fromRawCommand: (command) => planAddReminders([
        {
            title: command,
            date: null,
        },
    ]),
};
