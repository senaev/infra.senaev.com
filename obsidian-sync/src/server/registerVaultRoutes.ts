import { OBSIDIAN_VAULT_PATH } from '../env';
import { createVaultToolsConfig } from '../vault-tools/vaultToolsConfig';

import { ALLOWED_CALLERS } from './callers';
import type { VaultServer } from './createVaultServer';
import { registerMilestoneRoutes } from './registerMilestoneRoutes';
import { registerMtlsAuthentication } from './registerMtlsAuthentication';
import { registerMtlsAuthorization } from './registerMtlsAuthorization';
import { registerPublicFileRoutes } from './registerPublicFileRoutes';
import { registerPublicStaticRoutes } from './registerPublicStaticRoutes';
import { registerShortLinkRoutes } from './registerShortLinkRoutes';
import { registerTaskRoutes } from './registerTaskRoutes';
import { registerVaultMetricsRoutes } from './registerVaultMetricsRoutes';
import { registerVaultToolRoutes } from './registerVaultToolRoutes';

/**
 * Everything that reads or edits the vault. Only for the mTLS instance. Only the services in
 * `ALLOWED_CALLERS` may call any of these routes.
 */
export function registerProtectedVaultRoutes(server: VaultServer): void {
    // First, in this order, so the checks cover every route registered below.
    registerMtlsAuthentication(server);
    registerMtlsAuthorization(server, ALLOWED_CALLERS);
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
