import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { TASK_CHANGE_FIELDS } from 'senaev-utils/src/obsidianVaultTools/vaultCommands';
import { TASK_WRITE_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import {
    TASK_PRIORITIES, TASK_STATUSES, type TaskFields,
} from 'senaev-utils/src/obsidianTasks/taskLine';
import { readExpectedHash } from 'senaev-utils/src/toolServer/expectedHashArguments';
import {
    optionalEnum, optionalInteger, optionalObject, optionalString, readToolArguments, requiredNonEmptyString, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { optionalIsoDay, readVaultToolArguments } from '../toolArguments';

import { type TasksUpdateCommandInput, tasksUpdateCommand } from './tasksUpdateCommand';

/** `undefined` keeps the value, `null` clears it. */
function nullable<T>(args: ToolArguments, key: string, read: () => T | undefined): T | null | undefined {
    if (!Object.hasOwn(args, key)) {
        return undefined;
    }

    return args[key] === null ? null : read();
}

function required<T>(args: ToolArguments, key: string, read: () => T | undefined): T | undefined {
    if (Object.hasOwn(args, key) && args[key] === null) {
        throw invalidArguments(`"changes.${key}" cannot be null`);
    }

    return read();
}

function readChanges(args: ToolArguments): Partial<TaskFields> {
    const object = optionalObject(args, 'changes');

    if (object === undefined || Object.keys(object).length === 0) {
        throw invalidArguments('"changes" must be a non-empty object');
    }

    const changes = readToolArguments(object, TASK_CHANGE_FIELDS);
    const values: { [Key in keyof TaskFields]: TaskFields[Key] | undefined } = {
        status: required(changes, 'status', () => optionalEnum(changes, 'status', TASK_STATUSES)),
        description: required(changes, 'description', () => (Object.hasOwn(changes, 'description')
            ? requiredNonEmptyString(changes, 'description', TASK_WRITE_LIMITS.maxDescriptionLength)
            : undefined)),
        source: nullable(changes, 'source', () => optionalString(changes, 'source', TASK_WRITE_LIMITS.maxSourceLength)),
        priority: required(changes, 'priority', () => optionalEnum(changes, 'priority', TASK_PRIORITIES)),
        dueDate: nullable(changes, 'dueDate', () => optionalIsoDay(changes, 'dueDate')),
        closedDate: nullable(changes, 'closedDate', () => optionalIsoDay(changes, 'closedDate')),
        recurrence: nullable(changes, 'recurrence', () => optionalString(changes, 'recurrence', TASK_WRITE_LIMITS.maxRecurrenceLength)),
    };

    return Object.fromEntries(Object.entries(values).filter(([
        , value,
    ]) => value !== undefined)) as Partial<TaskFields>;
}

function parseTasksUpdateInput(input: unknown): TasksUpdateCommandInput {
    const args = readVaultToolArguments(input, 'tasks_update');
    const line = optionalInteger(args, 'line', {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
    });

    if (line === undefined) {
        throw invalidArguments('"line" is required');
    }

    return {
        path: requiredNonEmptyString(args, 'path'),
        line,
        expectedHash: readExpectedHash(args, 'expectedHash'),
        changes: readChanges(args),
    };
}

export const tasksUpdateTool = createCommandAdapter(parseTasksUpdateInput, tasksUpdateCommand);
