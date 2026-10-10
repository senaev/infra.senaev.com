import { INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN, OBSIDIAN_VAULT_PATH } from '../env';
import { logger } from '../logger';
import { createVaultToolsConfig } from '../vault-tools/vaultToolsConfig';
import { PUBLIC_DIR } from '../vaultPaths';

import { createVaultServer } from './createVaultServer';
import { registerInternalTokenCheck } from './registerInternalTokenCheck';
import { registerMilestoneRoutes } from './registerMilestoneRoutes';
import { registerPublicFileRoutes } from './registerPublicFileRoutes';
import { registerPublicStaticRoutes } from './registerPublicStaticRoutes';
import { registerShortLinkRoutes } from './registerShortLinkRoutes';
import { registerTaskRoutes } from './registerTaskRoutes';
import { registerVaultToolRoutes } from './registerVaultToolRoutes';

const HOST = '0.0.0.0';
const PORT = 8080;

/** Starts the vault HTTP API and resolves once it is accepting connections. */
export async function runVaultServer(): Promise<void> {
    const server = createVaultServer();

    // First, so the check covers every route registered below.
    registerInternalTokenCheck(server, INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_OBSIDIAN);
    registerVaultToolRoutes(server, createVaultToolsConfig(OBSIDIAN_VAULT_PATH));
    registerTaskRoutes(server);
    registerShortLinkRoutes(server);
    registerMilestoneRoutes(server);
    registerPublicStaticRoutes(server);
    // Registered last because it installs a catch-all GET route.
    registerPublicFileRoutes(server);

    await server.listen({
        port: PORT,
        host: HOST,
    });
    logger.info({
        port: PORT,
        publicDir: PUBLIC_DIR,
    }, '✅ Vault server listening');
}
