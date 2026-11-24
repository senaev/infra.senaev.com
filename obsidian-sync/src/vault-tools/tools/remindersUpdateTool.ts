import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { REMINDER_CHANGE_FIELDS } from 'senaev-utils/src/obsidianVaultTools/vaultCommands';
import { REMINDER_WRITE_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import {
    REMINDER_PRIORITIES, REMINDER_STATUSES, type ReminderFields,
} from 'senaev-utils/src/obsidianReminders/reminderLine';
import { readExpectedHash } from 'senaev-utils/src/toolServer/expectedHashArguments';
import {
    optionalEnum, optionalInteger, optionalObject, optionalString, readToolArguments, requiredNonEmptyString, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { optionalIsoDay, readVaultToolArguments } from '../toolArguments';

import { type RemindersUpdateCommandInput, remindersUpdateCommand } from './remindersUpdateCommand';

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

function readChanges(args: ToolArguments): Partial<ReminderFields> {
    const object = optionalObject(args, 'changes');

    if (object === undefined || Object.keys(object).length === 0) {
        throw invalidArguments('"changes" must be a non-empty object');
    }

    const changes = readToolArguments(object, REMINDER_CHANGE_FIELDS);
    const values: { [Key in keyof ReminderFields]: ReminderFields[Key] | undefined } = {
        status: required(changes, 'status', () => optionalEnum(changes, 'status', REMINDER_STATUSES)),
        description: required(changes, 'description', () => (Object.hasOwn(changes, 'description')
            ? requiredNonEmptyString(changes, 'description', REMINDER_WRITE_LIMITS.maxDescriptionLength)
            : undefined)),
        source: nullable(changes, 'source', () => optionalString(changes, 'source', REMINDER_WRITE_LIMITS.maxSourceLength)),
        priority: required(changes, 'priority', () => optionalEnum(changes, 'priority', REMINDER_PRIORITIES)),
        date: nullable(changes, 'date', () => optionalIsoDay(changes, 'date')),
        closedDate: nullable(changes, 'closedDate', () => optionalIsoDay(changes, 'closedDate')),
        recurrence: nullable(changes, 'recurrence', () => optionalString(changes, 'recurrence', REMINDER_WRITE_LIMITS.maxRecurrenceLength)),
    };

    return Object.fromEntries(Object.entries(values).filter(([
        , value,
    ]) => value !== undefined)) as Partial<ReminderFields>;
}

function parseRemindersUpdateInput(input: unknown): RemindersUpdateCommandInput {
    const args = readVaultToolArguments(input, 'reminders_update');
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

export const remindersUpdateTool = createCommandAdapter(parseRemindersUpdateInput, remindersUpdateCommand);
