import Fastify from 'fastify';

import { logger } from '../logger';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

import { registerCodeToolsRoutes } from './registerCodeToolsRoutes';

/** The tool routes on a plain instance for `inject`, without mTLS: for tests only. */
export function createTestCodeToolsServer(config: CodeToolsConfig) {
    const server = Fastify({
        loggerInstance: logger,
    });

    registerCodeToolsRoutes(server, config);

    return server;
}

export type TestCodeToolsServer = ReturnType<typeof createTestCodeToolsServer>;
