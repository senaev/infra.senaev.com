import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import { watchTlsCredentials } from 'senaev-utils/src/utils/mtls/watchTlsCredentials';

import { logger } from '../logger';
import { PUBLIC_DIR } from '../vaultPaths';

import { createVaultServer } from './createVaultServer';
import { registerProtectedVaultRoutes, registerPublicVaultRoutes } from './registerVaultRoutes';

const HOST = '0.0.0.0';
const PROTECTED_PORT = 8443;
// TODO: remove this plain HTTP port when nextjs-app and vmagent use mTLS, see
// projects/2026-11-15-11-00-inter-service-certificate-authentication/README.md
const PUBLIC_PORT = 8080;

/**
 * Starts the two vault HTTP servers and resolves once both accept connections.
 *
 * The protected API (everything that reads or edits the vault) is on 8443 behind mTLS. The
 * public instance on 8080 has only the published-file and metrics routes. They are separate
 * Fastify instances, so no protected route can ever be reached over plain HTTP.
 */
export async function runVaultServer(): Promise<{ close: () => Promise<void> }> {
    // The watcher needs the server for reloads, and the server needs the first credentials from the watcher.
    const reloadTarget: { server?: ReturnType<typeof createMtlsFastifyServer> } = {};
    const certificates = await watchTlsCredentials({
        onChange: (credentials) => {
            reloadTarget.server?.updateCredentials(credentials);
            logger.info({ validTo: credentials.validTo.toISOString() }, '🔐 Loaded the renewed mTLS certificate');
        },
        onError: (error) => logger.error({ err: error }, '❌ mTLS certificate files cannot be used, keeping the last valid ones'),
    });

    const protectedInstance = createMtlsFastifyServer({
        Fastify,
        credentials: certificates.credentials,
        logger: logger as FastifyBaseLogger,
    });

    reloadTarget.server = protectedInstance;

    const { server: protectedServer } = protectedInstance;
    const publicServer = createVaultServer();

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    registerProtectedVaultRoutes(protectedServer as unknown as FastifyInstance);
    registerPublicVaultRoutes(publicServer);

    await Promise.all([
        protectedServer.listen({
            port: PROTECTED_PORT,
            host: HOST,
        }),
        publicServer.listen({
            port: PUBLIC_PORT,
            host: HOST,
        }),
    ]);
    logger.info({
        protectedPort: PROTECTED_PORT,
        publicPort: PUBLIC_PORT,
        publicDir: PUBLIC_DIR,
    }, '✅ Vault servers listening');

    return {
        close: async () => {
            certificates.stop();
            await Promise.all([
                protectedServer.close(),
                publicServer.close(),
            ]);
        },
    };
}
