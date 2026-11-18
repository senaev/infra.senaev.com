import { OBSIDIAN_VAULT_PATH } from '../env';
import { createVaultToolsConfig } from '../vault-tools/vaultToolsConfig';

import type { VaultServer } from './createVaultServer';
import { registerMilestoneRoutes } from './registerMilestoneRoutes';
import { registerMtlsPeerCheck } from './registerMtlsPeerCheck';
import { registerPublicFileRoutes } from './registerPublicFileRoutes';
import { registerPublicStaticRoutes } from './registerPublicStaticRoutes';
import { registerShortLinkRoutes } from './registerShortLinkRoutes';
import { registerTaskRoutes } from './registerTaskRoutes';
import { registerVaultFileStatsRoute, registerVaultMetricsRoutes } from './registerVaultMetricsRoutes';
import { registerVaultToolRoutes } from './registerVaultToolRoutes';

/** Everything that reads or edits the vault. Only for the mTLS instance. */
export function registerProtectedVaultRoutes(server: VaultServer, allowedClientName: string): void {
    // First, so the check covers every route registered below.
    registerMtlsPeerCheck(server, allowedClientName);
    registerVaultFileStatsRoute(server, OBSIDIAN_VAULT_PATH);
    registerVaultToolRoutes(server, createVaultToolsConfig(OBSIDIAN_VAULT_PATH));
    registerTaskRoutes(server);
    registerShortLinkRoutes(server);
    registerMilestoneRoutes(server);
    registerPublicStaticRoutes(server);
}

/**
 * The published `?note=`/`?file=` files for nextjs-app, and the metrics for vmagent. Only for the
 * plain HTTP instance, so it must never get a route that reads or edits anything else.
 */
export function registerPublicVaultRoutes(server: VaultServer): void {
    registerVaultMetricsRoutes(server, OBSIDIAN_VAULT_PATH);
    // Registered last because it installs a catch-all GET route.
    registerPublicFileRoutes(server);
}
