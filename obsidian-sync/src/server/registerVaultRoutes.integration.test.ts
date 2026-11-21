import type { AddressInfo } from 'node:net';

import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';

import { logger } from '../logger';

const mocks = vi.hoisted(() => {
    return { readTlsFiles: vi.fn() };
});

vi.mock('senaev-utils/src/utils/mtls/tlsCredentials', async (importOriginal) => {
    return {
        ...await importOriginal<typeof import('senaev-utils/src/utils/mtls/tlsCredentials')>(),
        readTlsFiles: mocks.readTlsFiles,
    };
});

import { CLUSTER_HELPER } from './callers';
import { registerProtectedVaultRoutes, registerPublicVaultRoutes } from './registerVaultRoutes';

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
        path: '/public-static/index.html',
    },
] as const;

let protectedServer: FastifyInstance;
let publicServer: FastifyInstance;
let protectedOrigin: string;
let publicOrigin: string;
let allowedClient: MtlsClient;
let otherServiceClient: MtlsClient;

function originOf(server: FastifyInstance, protocol: string): string {
    return `${protocol}://localhost:${(server.server.address() as AddressInfo).port}`;
}

function createClient(origin: string, files: TlsFiles): MtlsClient {
    return createMtlsClient({
        origin,
        credentials: parseTlsCredentials(files),
    });
}

beforeAll(async () => {
    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });

    mocks.readTlsFiles.mockResolvedValue(serverFiles);

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    protectedServer = await createMtlsFastifyServer({
        Fastify,
        logger: logger as FastifyBaseLogger,
    }) as unknown as FastifyInstance;
    registerProtectedVaultRoutes(protectedServer);
    publicServer = Fastify({
        loggerInstance: logger as FastifyBaseLogger,
    });
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
        dnsName: CLUSTER_HELPER,
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
        expect(response.status).not.toBe(403);
    });

    it.each(PROTECTED_REQUESTS)('refuse another service with a valid certificate: $method $path', async ({ method, path }) => {
        const response = await otherServiceClient.fetch(`${protectedOrigin}${path}`, { method });

        expect(response.status).toBe(403);
    });

    it('refuse an unknown path with 403, so the 404 handler is covered', async () => {
        const response = await otherServiceClient.fetch(`${protectedOrigin}/no-such-route`);

        expect(response.status).toBe(403);
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
