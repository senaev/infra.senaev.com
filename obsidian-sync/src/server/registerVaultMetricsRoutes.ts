import { logger } from '../logger';
import { renderVaultMetrics, scanVaultInventory } from '../telemetry/vaultInventory';

import type { VaultServer } from './createVaultServer';

const METRICS_CACHE_MS = 15_000;

export function registerVaultMetricsRoutes(server: VaultServer, root: string): void {
    let lastScanAt = 0;
    let lastSuccessfulScan = 0;
    let lastMetrics: string | undefined;
    let running: Promise<string> | undefined;

    const metrics = (): Promise<string> => {
        if (lastMetrics && Date.now() - lastScanAt < METRICS_CACHE_MS) {
            return Promise.resolve(lastMetrics);
        }

        if (!running) {
            running = scanVaultInventory(root).then((snapshot) => {
                lastSuccessfulScan = snapshot.scannedAt;

                return renderVaultMetrics(snapshot);
            }).catch((error: unknown) => {
                logger.error({ err: error }, '❌ Vault inventory scan failed');

                return [
                    '# HELP obsidian_vault_scan_success Whether the most recent inventory scan succeeded.',
                    '# TYPE obsidian_vault_scan_success gauge',
                    'obsidian_vault_scan_success 0',
                    '# HELP obsidian_vault_last_scan_timestamp_seconds Time of the latest successful scan.',
                    '# TYPE obsidian_vault_last_scan_timestamp_seconds gauge',
                    `obsidian_vault_last_scan_timestamp_seconds ${lastSuccessfulScan}`,
                    '',
                ].join('\n');
            }).then((rendered) => {
                lastMetrics = rendered;
                lastScanAt = Date.now();

                return rendered;
            }).finally(() => {
                running = undefined;
            });
        }

        return running;
    };

    // Accessible to vmagent through Kubernetes NetworkPolicy only. Other vault
    // routes still require the internal token; do not add a public ingress.
    server.get('/metrics', { config: { isPublicWithoutInternalToken: true } }, (_request, reply) => {
        reply.type('text/plain; version=0.0.4; charset=utf-8');

        return metrics();
    });

    // Detailed filenames stay on the authenticated internal API (not Prometheus).
    // ?path= is an exact-match lookup in the scanned, allowed vault file inventory.
    server.get<{ Querystring: { path?: string } }>('/vault/file-stats', async (request, reply) => {
        if (request.query.path === undefined) {
            return scanVaultInventory(root);
        }

        const snapshot = await scanVaultInventory(root, true);
        const file = snapshot.files?.find(({ path }) => path === request.query.path);

        if (!file) {
            return reply.code(404).send({
                status: 'error',
                code: 'not_found',
                message: 'Vault file not found',
            });
        }

        return file;
    });
}
