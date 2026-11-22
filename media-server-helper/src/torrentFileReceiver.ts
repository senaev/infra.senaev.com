import Fastify, { type FastifyInstance } from 'fastify';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';

import { logger } from './logger';
import { registerTorrentFileRoutes } from './registerTorrentFileRoutes';

const PORT = 8443;
const BODY_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * Receives torrent files on an mTLS port. There is no plain HTTP port and no probe: the only
 * caller is cluster-helper, which keeps the files in its outbox until the delivery works.
 */
export async function runTorrentFileReceiver(writeFile: (buffer: Buffer, fileName: string) => string): Promise<void> {
    const certificates = await watchTlsCredentials({ logger });
    const server = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials: certificates.credentials,
        bodyLimit: BODY_LIMIT_BYTES,
    });

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    registerTorrentFileRoutes(server as unknown as FastifyInstance, writeFile);

    await server.listen({
        port: PORT,
        host: '0.0.0.0',
    });
    logger.info({ port: PORT }, '✅ Torrent file receiver listening');
}
