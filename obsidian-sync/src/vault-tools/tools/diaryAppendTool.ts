import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { readToolArguments, requiredString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';
import { isDailyNoteDate } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import { DIARY_APPEND_LIMITS } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';

import { readVaultToolArguments } from '../toolArguments';

import {
    type DiaryAppendCommandInput, type DiaryRecordInput, diaryAppendCommand,
} from './diaryAppendCommand';

function parseRecord(value: unknown, index: number): DiaryRecordInput {
    const field = `records[${index}]`;
    const record = readToolArguments(value, [
        'date',
        'text',
    ]);
    const date = requiredString(record, 'date');
    const text = requiredString(record, 'text').trim();

    if (!isDailyNoteDate(date)) {
        throw invalidArguments(`"${field}.date" must be a day that exists, as YYYY-MM-DD`);
    }

    if (text === '') {
        throw invalidArguments(`"${field}.text" must not be blank`);
    }

    return {
        date,
        text,
    };
}

function parseDiaryAppendInput(input: unknown): DiaryAppendCommandInput {
    const args = readVaultToolArguments(input, 'diary_append');
    const { records } = args;

    if (!Array.isArray(records) || records.length === 0 || records.length > DIARY_APPEND_LIMITS.maxRecords) {
        throw invalidArguments(`"records" must be an array of 1 to ${DIARY_APPEND_LIMITS.maxRecords} records`);
    }

    return { records: records.map(parseRecord) };
}

export const diaryAppendTool = createCommandAdapter(parseDiaryAppendInput, diaryAppendCommand);
