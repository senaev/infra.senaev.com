import Fastify from 'fastify';

import { logger } from '../logger';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

import { CODE_TOOLS_BODY_LIMIT_BYTES } from './codeToolsBodyLimit';
import { registerCodeToolsRoutes } from './registerCodeToolsRoutes';

/** The tool routes on a plain instance for `inject`, without mTLS: for tests only. */
export function createTestCodeToolsServer(config: CodeToolsConfig) {
    const server = Fastify({
        loggerInstance: logger,
        bodyLimit: CODE_TOOLS_BODY_LIMIT_BYTES,
    });

    registerCodeToolsRoutes(server, config);

    return server;
}

export type TestCodeToolsServer = ReturnType<typeof createTestCodeToolsServer>;
