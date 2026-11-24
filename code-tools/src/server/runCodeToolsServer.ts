import Fastify from 'fastify';
import { createHealthServer } from 'senaev-utils/src/utils/http/createHealthServer';
import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';

import { logger } from '../logger';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

import { createCodeToolsMtlsServer } from './createCodeToolsMtlsServer';

const HOST = '0.0.0.0';
const TOOLS_PORT = 8443;
const HEALTH_PORT = 8081;

/**
 * Starts the two servers and resolves once both accept connections.
 *
 * The tool routes are on 8443 behind mTLS: only the services in `ALLOWED_CALLERS` may call them.
 * The kubelet cannot present a certificate, so the plain HTTP instance on 8081 serves only
 * `/health`. They are separate Fastify instances, so no tool route can be reached over plain HTTP.
 */
export async function runCodeToolsServer(config: CodeToolsConfig): Promise<{ close: () => Promise<void> }> {
    const certificates = await watchTlsCredentials({ logger });
    const toolsServer = createCodeToolsMtlsServer(certificates.credentials, config);
    const healthServer = createHealthServer({
        Fastify,
        logger,
    });

    await Promise.all([
        toolsServer.listen({
            port: TOOLS_PORT,
            host: HOST,
        }),
        healthServer.listen({
            port: HEALTH_PORT,
            host: HOST,
        }),
    ]);
    logger.info({
        toolsPort: TOOLS_PORT,
        healthPort: HEALTH_PORT,
    }, '✅ Code tools servers listening');

    return {
        close: async () => {
            certificates.stop();
            await Promise.all([
                toolsServer.close(),
                healthServer.close(),
            ]);
        },
    };
}
