import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';
import { installGracefulShutdown } from 'senaev-utils/src/utils/process/installGracefulShutdown';

import { logger } from './logger';
import { createPromptRunner, spawnClaude } from './runPrompt';
import { createPromptApiServer } from './server';

const HOST = '0.0.0.0';
const PORT = 8080;
// A run that searches the web and writes notes can take a while; n8n waits as long.
const RUN_TIMEOUT_MS = 30 * 60 * 1000;
// The runs work here, apart from /code; their session history is kept in HOME under this folder.
const RUN_DIRECTORY = join(homedir(), 'prompt-api');

const server = createPromptApiServer(createPromptRunner({
    spawnClaude,
    model: requireEnv('CLAUDE_CODE_MODEL'),
    timeoutMs: RUN_TIMEOUT_MS,
}));

const lifecycle = installGracefulShutdown({
    stop: () => server.close(),
    reportError: (error) => logger.error(error, '❌ Prompt API shutdown failed'),
});

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
