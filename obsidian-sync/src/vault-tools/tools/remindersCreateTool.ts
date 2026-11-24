import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { REMINDER_WRITE_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { REMINDER_PRIORITIES } from 'senaev-utils/src/obsidianReminders/reminderLine';
import { readExpectedHash } from 'senaev-utils/src/toolServer/expectedHashArguments';
import {
    optionalEnum, optionalInteger, optionalString, requiredNonEmptyString, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { optionalIsoDay, readVaultToolArguments } from '../toolArguments';

import { type RemindersCreateCommandInput, remindersCreateCommand } from './remindersCreateCommand';

const DEFAULT_SOURCE = 'Agent';

function readBlankLines(args: ToolArguments, key: string): number {
    return optionalInteger(args, key, {
        min: 0,
        max: REMINDER_WRITE_LIMITS.maxBlankLines,
    }) ?? 0;
}

function parseRemindersCreateInput(input: unknown): RemindersCreateCommandInput {
    const args = readVaultToolArguments(input, 'reminders_create');
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
        reminder: {
            status: 'open',
            description: requiredNonEmptyString(args, 'description', REMINDER_WRITE_LIMITS.maxDescriptionLength),
            source: optionalString(args, 'source', REMINDER_WRITE_LIMITS.maxSourceLength) ?? DEFAULT_SOURCE,
            priority: optionalEnum(args, 'priority', REMINDER_PRIORITIES) ?? 'normal',
            date: optionalIsoDay(args, 'date') ?? null,
            closedDate: null,
            recurrence: optionalString(args, 'recurrence', REMINDER_WRITE_LIMITS.maxRecurrenceLength) ?? null,
        },
    };
}

export const remindersCreateTool = createCommandAdapter(parseRemindersCreateInput, remindersCreateCommand);
