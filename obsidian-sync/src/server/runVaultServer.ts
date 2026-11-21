import { watchTlsMaterial } from 'senaev-utils/src/utils/mtls/watchTlsMaterial';

import { MTLS_ALLOWED_CLIENT_NAME } from '../env';
import { logger } from '../logger';
import { PUBLIC_DIR } from '../vaultPaths';

import { createProtectedVaultServer, createVaultServer } from './createVaultServer';
import { registerProtectedVaultRoutes, registerPublicVaultRoutes } from './registerVaultRoutes';

const HOST = '0.0.0.0';
const PROTECTED_PORT = 8443;
const PUBLIC_PORT = 8080;

/**
 * Starts the two vault HTTP servers and resolves once both accept connections.
 *
 * The protected API (everything that reads or edits the vault) is on 8443 behind mTLS. The
 * public instance on 8080 has only the published-file and metrics routes. They are separate
 * Fastify instances, so no protected route can ever be reached over plain HTTP.
 */
export async function runVaultServer() {
    // The watcher needs the server for reloads, and the server needs the first material from the watcher.
    const reloadTarget: { server?: ReturnType<typeof createProtectedVaultServer> } = {};
    const certificates = await watchTlsMaterial({
        onChange: (material) => {
            reloadTarget.server?.updateMaterial(material);
            logger.info({ validTo: material.validTo.toISOString() }, '🔐 Loaded the renewed mTLS certificate');
        },
        onError: (error) => logger.error({ err: error }, '❌ mTLS certificate files cannot be used, keeping the last valid ones'),
    });

    const protectedInstance = createProtectedVaultServer(certificates.material);

    reloadTarget.server = protectedInstance;

    const { server: protectedServer } = protectedInstance;
    const publicServer = createVaultServer();

    registerProtectedVaultRoutes(protectedServer, MTLS_ALLOWED_CLIENT_NAME);
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
