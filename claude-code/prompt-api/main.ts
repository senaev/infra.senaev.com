import { mkdir } from 'node:fs/promises';

import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';
import { createShutdownController } from 'senaev-utils/src/utils/process/createShutdownController';

import { logger } from './logger';
import { createPromptRunner, spawnClaude } from './runPrompt';
import { createPromptApiServer } from './server';

const HOST = '0.0.0.0';
const PORT = 8080;
// A job search round searches the web and writes notes, which can take a while; n8n waits as long.
const RUN_TIMEOUT_MS = 60 * 60 * 1000;
// The working folder of the runs, next to /code but apart from it: their session history
// (~/.claude/projects/-prompt-api, kept in HOME) stays apart from the Remote Control sessions, and
// files a run writes without a full path do not land in the repositories. The folder is in the
// container, so these files are lost on restart. It does not limit access.
const RUN_DIRECTORY = '/prompt-api';

const server = createPromptApiServer(createPromptRunner({
    spawnClaude,
    model: requireEnv('CLAUDE_CODE_MODEL'),
    timeoutMs: RUN_TIMEOUT_MS,
}));

const lifecycle = createShutdownController({
    process,
    reportError: (error) => logger.error(error, '❌ Prompt API shutdown failed'),
});

lifecycle.subscribeShutdown(() => server.close());

async function main(): Promise<void> {
    await mkdir(RUN_DIRECTORY, { recursive: true });
    process.chdir(RUN_DIRECTORY);
    await server.listen({
        port: PORT,
        host: HOST,
    });
    logger.info({ port: PORT }, '✅ Prompt API listening');
}

main().catch(async (error) => {
    if (!lifecycle.signal.aborted) {
        logger.error(error, '❌ Prompt API exited');
        await lifecycle.shutdown(1);
    }
});
