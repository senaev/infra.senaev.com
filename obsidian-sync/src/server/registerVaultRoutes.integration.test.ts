import type { AddressInfo } from 'node:net';

import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsMaterial, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsMaterial';
import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import {
    createProtectedVaultServer, createVaultServer, type VaultServer,
} from './createVaultServer';
import { registerProtectedVaultRoutes, registerPublicVaultRoutes } from './registerVaultRoutes';

const CALLER_NAME = 'cluster-helper.test.svc.cluster.local';

const PROTECTED_REQUESTS = [
    {
        method: 'POST',
        path: '/vault/list',
    },
    {
        method: 'POST',
        path: '/vault-file-resource',
    },
    {
        method: 'POST',
        path: '/tasks',
    },
    {
        method: 'POST',
        path: '/short_links',
    },
    {
        method: 'GET',
        path: '/short_links/abc',
    },
    {
        method: 'GET',
        path: '/milestones',
    },
    {
        method: 'GET',
        path: '/vault/file-stats',
    },
    {
        method: 'GET',
        path: '/public-static/index.html',
    },
] as const;

let protectedServer: VaultServer;
let publicServer: VaultServer;
let protectedOrigin: string;
let publicOrigin: string;
let allowedClient: MtlsClient;
let otherServiceClient: MtlsClient;

function originOf(server: VaultServer, protocol: string): string {
    return `${protocol}://localhost:${(server.server.address() as AddressInfo).port}`;
}

function createClient(origin: string, files: TlsFiles): MtlsClient {
    return createMtlsClient({
        origin,
        material: parseTlsMaterial(files),
    });
}

beforeAll(async () => {
    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });
    const instance = createProtectedVaultServer(parseTlsMaterial(serverFiles));

    protectedServer = instance.server;
    registerProtectedVaultRoutes(protectedServer, CALLER_NAME);
    publicServer = createVaultServer();
    registerPublicVaultRoutes(publicServer);
    await Promise.all([
        protectedServer.listen({
            port: 0,
            host: '127.0.0.1',
        }),
        publicServer.listen({
            port: 0,
            host: '127.0.0.1',
        }),
    ]);
    protectedOrigin = originOf(protectedServer, 'https');
    publicOrigin = originOf(publicServer, 'http');
    allowedClient = createClient(protectedOrigin, await issueTestCertificate({
        ca,
        dnsName: CALLER_NAME,
        usage: 'client',
    }));
    otherServiceClient = createClient(protectedOrigin, await issueTestCertificate({
        ca,
        dnsName: 'nextjs-app.test.svc.cluster.local',
        usage: 'client',
    }));
});

afterAll(async () => {
    await Promise.all([
        allowedClient.close(),
        otherServiceClient.close(),
        protectedServer.close(),
        publicServer.close(),
    ]);
});

describe('protected vault routes', () => {
    it.each(PROTECTED_REQUESTS)('let the allowed service through: $method $path', async ({ method, path }) => {
        const response = await allowedClient.fetch(`${protectedOrigin}${path}`, { method });

        expect(response.status).not.toBe(401);
    });

    it.each(PROTECTED_REQUESTS)('refuse another service with a valid certificate: $method $path', async ({ method, path }) => {
        const response = await otherServiceClient.fetch(`${protectedOrigin}${path}`, { method });

        expect(response.status).toBe(401);
    });

    it('refuse an unknown path with 401 too, so the 404 handler is covered', async () => {
        const response = await otherServiceClient.fetch(`${protectedOrigin}/no-such-route`);

        expect(response.status).toBe(401);
    });
});

describe('public vault routes', () => {
    it('serve the metrics and the published-file query without a certificate', async () => {
        expect((await fetch(`${publicOrigin}/metrics`)).status).toBe(200);

        const response = await fetch(`${publicOrigin}/`);

        expect(response.status).toBe(400);
        expect(await response.text()).toContain('Missing required query parameter');
    });

    it.each(PROTECTED_REQUESTS)('do not carry the protected route $method $path', async ({ method, path }) => {
        const response = await fetch(`${publicOrigin}${path}`, { method });

        // A GET falls into the catch-all of the published-file routes, which needs a ?note= or ?file=.
        expect(response.status).toBe(method === 'GET' ? 400 : 404);
        expect(await response.text()).not.toContain('"status":"ok"');
    });
});
