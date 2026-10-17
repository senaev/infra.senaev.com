import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { TASK_WRITE_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { TASK_PRIORITIES } from 'senaev-utils/src/obsidianTasks/taskLine';
import { readExpectedHash } from 'senaev-utils/src/toolServer/expectedHashArguments';
import {
    optionalEnum, optionalInteger, optionalString, requiredNonEmptyString, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { optionalIsoDay, readVaultToolArguments } from '../toolArguments';

import { type TasksCreateCommandInput, tasksCreateCommand } from './tasksCreateCommand';

const DEFAULT_SOURCE = 'Agent';

function readBlankLines(args: ToolArguments, key: string): number {
    return optionalInteger(args, key, {
        min: 0,
        max: TASK_WRITE_LIMITS.maxBlankLines,
    }) ?? 0;
}

function parseTasksCreateInput(input: unknown): TasksCreateCommandInput {
    const args = readVaultToolArguments(input, 'tasks_create');
    const afterLine = optionalInteger(args, 'afterLine', {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
    });

    if (afterLine === undefined) {
        throw invalidArguments('"afterLine" is required; use 0 for the top of the note');
    }

    return {
        path: requiredNonEmptyString(args, 'path'),
        expectedHash: readExpectedHash(args, 'expectedHash'),
        afterLine,
        blankLinesBefore: readBlankLines(args, 'blankLinesBefore'),
        blankLinesAfter: readBlankLines(args, 'blankLinesAfter'),
        task: {
            status: 'open',
            description: requiredNonEmptyString(args, 'description', TASK_WRITE_LIMITS.maxDescriptionLength),
            source: optionalString(args, 'source', TASK_WRITE_LIMITS.maxSourceLength) ?? DEFAULT_SOURCE,
            priority: optionalEnum(args, 'priority', TASK_PRIORITIES) ?? 'normal',
            dueDate: optionalIsoDay(args, 'dueDate') ?? null,
            closedDate: null,
            recurrence: optionalString(args, 'recurrence', TASK_WRITE_LIMITS.maxRecurrenceLength) ?? null,
        },
    };
}

export const tasksCreateTool = createCommandAdapter(parseTasksCreateInput, tasksCreateCommand);
