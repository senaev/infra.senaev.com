import { OBSIDIAN_TASKS_CHAT_ID } from '../../env';
import { addObsidianTasks, type ObsidianTaskInput } from '../../obsidianSyncApi';

import type { PlannedTrickyDadAction, TrickyDadAction } from './TrickyDadAction';

const TYPE = 'add_tasks';

const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function planAddTasks(tasks: ObsidianTaskInput[]): PlannedTrickyDadAction {
    return {
        type: TYPE,
        emoji: '👉',
        reportChatId: OBSIDIAN_TASKS_CHAT_ID,
        entries: tasks.map(({ title }) => title),
        run: async ({ source }) => {
            await addObsidianTasks(tasks.map(({ title, due_date }) => {
                return {
                    title: `${title} 🌱 ${source}`,
                    due_date,
                };
            }));

            return [];
        },
    };
}

function parseTask(task: unknown): ObsidianTaskInput {
    if (typeof task !== 'object' || task === null) {
        throw new Error(`${TYPE}: every task must be an object, got [${JSON.stringify(task)}]`);
    }

    const { title, due_date } = task as Record<string, unknown>;

    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error(`${TYPE}: task title must be a non-empty string, got [${JSON.stringify(title)}]`);
    }

    if (due_date !== null && (typeof due_date !== 'string' || !DUE_DATE_PATTERN.test(due_date))) {
        throw new Error(`${TYPE}: task due_date must be YYYY-MM-DD or null, got [${JSON.stringify(due_date)}]`);
    }

    return {
        title: title.trim(),
        due_date,
    };
}

export const ADD_TASKS_ACTION: TrickyDadAction = {
    type: TYPE,
    whenToUse: [
        `Use ${TYPE} only for explicit assignments to Dad/Papa, Andrei or the user's husband, or explicit additions to his task list.`,
        'Mentioning him or invoking the skill does not assign him an action. Apply this rule in every language; never infer an assignee from the action, deadline, place or speaker.',
    ],
    instructions: [
        'Return each distinct action as a separate entry in tasks; never split a single action. Never return an empty tasks array.',
        'Keep task titles as close to the original wording as possible, changing only what is necessary. Never summarize or drop details; every detail must appear in a title.',
        'Preserve names, places, products, services, file names, commands, errors, IDs, numbers, amounts, times and quoted text exactly.',
        'Keep full URLs unchanged in the relevant title; a link applying to the whole message goes into every title.',
        'Extract each deadline as due_date (YYYY-MM-DD), or null if absent. A deadline applying to the whole message applies to every task.',
    ],
    argsProperties: {
        tasks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    due_date: {
                        type: [
                            'string',
                            'null',
                        ],
                    },
                },
                required: [
                    'title',
                    'due_date',
                ],
                additionalProperties: false,
            },
        },
    },
    parseArgs: ({ tasks }) => {
        if (!Array.isArray(tasks) || tasks.length === 0) {
            throw new Error(`${TYPE}: tasks must be a non-empty array, got [${JSON.stringify(tasks)}]`);
        }

        return planAddTasks(tasks.map(parseTask));
    },
    fromRawCommand: (command) => planAddTasks([
        {
            title: command,
            due_date: null,
        },
    ]),
};
