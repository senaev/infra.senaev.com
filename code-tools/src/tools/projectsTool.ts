import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';

import { readCodeToolArguments } from './toolArguments';
import { type ProjectsCommandInput, projectsCommand } from './projectsCommand';

export const projectsTool = createCommandAdapter((input: unknown): ProjectsCommandInput => {
    readCodeToolArguments(input, 'projects');

    return {};
}, projectsCommand);
