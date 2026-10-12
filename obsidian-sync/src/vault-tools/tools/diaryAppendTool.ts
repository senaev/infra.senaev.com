import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/toolServer/ToolError';

import { readVaultToolArguments } from '../toolArguments';

import { type DiaryAppendCommandInput, diaryAppendCommand } from './diaryAppendCommand';

function parseDiaryAppendInput(input: unknown): DiaryAppendCommandInput {
    const args = readVaultToolArguments(input, 'diary_append');
    const text = requiredNonEmptyString(args, 'text').trim();

    if (text === '') {
        throw invalidArguments('"text" must not be blank');
    }

    return { text };
}

export const diaryAppendTool = createCommandAdapter(parseDiaryAppendInput, diaryAppendCommand);
