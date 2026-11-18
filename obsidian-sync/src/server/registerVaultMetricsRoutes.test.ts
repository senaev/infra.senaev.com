import {
    mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach, expect, it,
} from 'vitest';

import { createVaultServer } from './createVaultServer';
import { registerVaultFileStatsRoute, registerVaultMetricsRoutes } from './registerVaultMetricsRoutes';

const servers: ReturnType<typeof createVaultServer>[] = [];
const roots: string[] = [];

afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await Promise.all(roots.map((root) => rm(root, {
        recursive: true,
        force: true,
    })));
    servers.length = 0;
    roots.length = 0;
});

it('exposes only the scrape metrics on the public instance, and file details on the protected one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vault-metrics-route-'));

    roots.push(root);
    await writeFile(join(root, 'file.csv'), 'hello');
    const server = createVaultServer();

    servers.push(server);
    registerVaultMetricsRoutes(server, root);

    const metrics = await server.inject({
        method: 'GET',
        url: '/metrics',
    });

    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toMatch(/^text\/plain; version=0\.0\.4/u);
    expect(metrics.body).toContain('obsidian_vault_files_total 1');
    expect(metrics.body).toContain('obsidian_vault_scan_success 1');

    expect((await server.inject({
        method: 'GET',
        url: '/vault/file-stats',
    })).statusCode).toBe(404);

    const protectedServer = createVaultServer();

    servers.push(protectedServer);
    registerVaultFileStatsRoute(protectedServer, root);
    const details = await protectedServer.inject({
        method: 'GET',
        url: '/vault/file-stats',
    });

    expect(details.statusCode).toBe(200);
    expect(details.json()).toMatchObject({
        totalFiles: 1,
        largest: {
            path: 'file.csv',
            bytes: 5,
        },
    });
});

it('indicates scan failure instead of serving stale inventory as healthy', async () => {
    const root = join(tmpdir(), 'this-vault-does-not-exist');
    const server = createVaultServer();

    servers.push(server);
    registerVaultMetricsRoutes(server, root);
    const metrics = await server.inject({
        method: 'GET',
        url: '/metrics',
    });

    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('obsidian_vault_scan_success 0');
    expect(metrics.body).not.toContain('obsidian_vault_files_total');
});
