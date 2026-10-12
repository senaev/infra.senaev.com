import { CLONE_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { optionalString, requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/toolServer/ToolError';

import { readCodeToolArguments } from './toolArguments';
import {
    type CloneCommandInput, getRepositoryName, cloneCommand,
} from './cloneCommand';

function readUrl(args: Record<string, unknown>): string {
    const url = requiredNonEmptyString(args, 'url', CLONE_LIMITS.maxUrlLength).trim();

    // A leading "-" would be read as a git option.
    if (url.startsWith('-') || /\s/.test(url)) {
        throw invalidArguments('"url" must be a repository URL such as "git@github.com:owner/repo.git"');
    }

    return url;
}

function parseCloneInput(input: unknown): CloneCommandInput {
    const args = readCodeToolArguments(input, 'clone');
    const url = readUrl(args);
    const name = optionalString(args, 'name') ?? getRepositoryName(url);

    return {
        url,
        name,
    };
}

export const cloneTool = createCommandAdapter(parseCloneInput, cloneCommand);
