import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { TASKS_LIST_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { TASK_PRIORITIES, TASK_STATUSES } from 'senaev-utils/src/obsidianTasks/taskLine';
import {
    optionalString, readPageArguments, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { readNoteScope } from '../noteScopeArguments';
import { readTextQuery } from '../textQuery';
import { optionalIsoDay, readVaultToolArguments } from '../toolArguments';

import {
    type DayRange, type TasksListCommandInput, tasksListCommand,
} from './tasksListCommand';

function optionalEnumArray<T extends string>(args: ToolArguments, key: string, values: readonly T[]): T[] | undefined {
    const value = args[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (!Array.isArray(value) || value.length === 0 || value.some((item) => !(values as readonly unknown[]).includes(item))) {
        throw invalidArguments(`"${key}" must be a non-empty array of: ${values.join(', ')}`);
    }

    return value as T[];
}

function readDayRange(args: ToolArguments, fromKey: string, toKey: string): DayRange {
    const from = optionalIsoDay(args, fromKey);
    const to = optionalIsoDay(args, toKey);

    if (from !== undefined && to !== undefined && from > to) {
        throw invalidArguments(`"${fromKey}" must not be later than "${toKey}"`);
    }

    return {
        from,
        to,
    };
}

function readDailyNote(args: ToolArguments): string | undefined {
    const value = optionalString(args, 'dailyNote');

    return value === 'today' ? value : optionalIsoDay(args, 'dailyNote');
}

function parseTasksListInput(input: unknown): TasksListCommandInput {
    const args = readVaultToolArguments(input, 'tasks_list');

    if (args.match !== undefined || args.wholeWord !== undefined) {
        if (args.queries === undefined) {
            throw invalidArguments('"match" and "wholeWord" need "queries"');
        }
    }

    return {
        scope: readNoteScope(args),
        dailyNote: readDailyNote(args),
        statuses: optionalEnumArray(args, 'status', TASK_STATUSES),
        priorities: optionalEnumArray(args, 'priority', TASK_PRIORITIES),
        textQuery: readTextQuery(args),
        due: readDayRange(args, 'dueFrom', 'dueTo'),
        closed: readDayRange(args, 'closedFrom', 'closedTo'),
        ...readPageArguments(args, TASKS_LIST_LIMITS),
    };
}

export const tasksListTool = createCommandAdapter(parseTasksListInput, tasksListCommand);
