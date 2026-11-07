import { isIsoDay } from 'senaev-utils/src/obsidianTasks/isoDay';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { isNonEmptyArray } from 'senaev-utils/src/utils/Array/isNonEmptyArray/isNonEmptyArray';
import { isNonEmptyString } from 'senaev-utils/src/utils/String/NonEmptyString/NonEmptyString';

import { OBSIDIAN_TASKS_CHAT_ID } from '../../env';
import { addObsidianTasks, type ObsidianTaskInput } from '../../obsidianSyncApi';

import type { PlannedTrickyDadAction, TrickyDadAction } from './TrickyDadAction';

const TYPE = 'add_tasks';

type TaskWithDate = { title: string; date: string | null };

function planAddTasks(tasks: TaskWithDate[]): PlannedTrickyDadAction {
    return {
        type: TYPE,
        emoji: '👉',
        reportChatId: OBSIDIAN_TASKS_CHAT_ID,
        entries: tasks.map(({ title }) => title),
        run: async ({ source }) => {
            await addObsidianTasks(tasks.map(({ title, date }): ObsidianTaskInput => {
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

function parseTask(task: unknown): TaskWithDate {
    if (!isObject(task) || Array.isArray(task)) {
        throw new Error(`${TYPE}: every task must be an object, got [${JSON.stringify(task)}]`);
    }

    const { title, date } = task;

    const trimmedTitle = isNonEmptyString(title) ? title.trim() : '';

    if (!isNonEmptyString(trimmedTitle)) {
        throw new Error(`${TYPE}: task title must be a non-empty string, got [${JSON.stringify(title)}]`);
    }

    if (date !== null && (!isNonEmptyString(date) || !isIsoDay(date))) {
        throw new Error(`${TYPE}: task date must be a real YYYY-MM-DD or null, got [${JSON.stringify(date)}]`);
    }

    return {
        title: trimmedTitle,
        date,
    };
}

export const ADD_TASKS_ACTION: TrickyDadAction = {
    type: TYPE,
    whenToUse: [
        `Use ${TYPE} only for explicit assignments to Dad/Papa, Andrei or the user's husband, or explicit additions to his task list.`,
        'Mentioning him or invoking the skill does not assign him an action. Apply this rule in every language; never infer an assignee from the action, date, place or speaker.',
    ],
    instructions: [
        'Return each distinct action as a separate entry in tasks; never split a single action. Never return an empty tasks array.',
        'Keep task titles as close to the original wording as possible, changing only what is necessary. Never summarize or drop details; every detail must appear in a title.',
        'Preserve names, places, products, services, file names, commands, errors, IDs, numbers, amounts, times and quoted text exactly.',
        'Keep full URLs unchanged in the relevant title; a link applying to the whole message goes into every title.',
        'Extract each relevant date as date (YYYY-MM-DD), or null if absent. A date may be a start date, due date or any other kind; do not assume its meaning. A date applying to the whole message applies to every task.',
    ],
    argsProperties: {
        tasks: {
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
    parseArgs: ({ tasks }) => {
        if (!isNonEmptyArray(tasks)) {
            throw new Error(`${TYPE}: tasks must be a non-empty array, got [${JSON.stringify(tasks)}]`);
        }

        return planAddTasks(tasks.map(parseTask));
    },
    fromRawCommand: (command) => planAddTasks([
        {
            title: command,
            date: null,
        },
    ]),
};
