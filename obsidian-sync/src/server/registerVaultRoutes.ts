import { OBSIDIAN_VAULT_PATH } from '../env';
import { createVaultToolsConfig } from '../vault-tools/vaultToolsConfig';

import { CLUSTER_HELPER } from './callers';
import type { VaultServer } from './createVaultServer';
import { registerMilestoneRoutes } from './registerMilestoneRoutes';
import { registerMtlsAuthorization, registerRoutesForCallers } from './registerMtlsAuthorization';
import { registerPublicFileRoutes } from './registerPublicFileRoutes';
import { registerPublicStaticRoutes } from './registerPublicStaticRoutes';
import { registerShortLinkRoutes } from './registerShortLinkRoutes';
import { registerTaskRoutes } from './registerTaskRoutes';
import { registerVaultMetricsRoutes } from './registerVaultMetricsRoutes';
import { registerVaultToolRoutes } from './registerVaultToolRoutes';

/**
 * Everything that reads or edits the vault. Only for the mTLS instance. Register a route inside
 * `registerRoutesForCallers` with the services that may call it: a route outside is denied.
 */
export function registerProtectedVaultRoutes(server: VaultServer): void {
    // First, so the check covers every route registered below.
    registerMtlsAuthorization(server);
    registerRoutesForCallers(server, [CLUSTER_HELPER], (scope) => {
        registerVaultToolRoutes(scope, createVaultToolsConfig(OBSIDIAN_VAULT_PATH));
        registerTaskRoutes(scope);
        registerShortLinkRoutes(scope);
        registerMilestoneRoutes(scope);
        registerPublicStaticRoutes(scope);
    });
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
