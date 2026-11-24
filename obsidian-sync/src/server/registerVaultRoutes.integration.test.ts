import type { AddressInfo } from 'node:net';

import Fastify, { type FastifyInstance } from 'fastify';
import { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsFastifyServer } from 'senaev-utils/src/utils/mtls/createMtlsFastifyServer';
import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { logger } from '../logger';

import { CLUSTER_HELPER } from './callers';
import { registerProtectedVaultRoutes, registerPublicVaultRoutes } from './registerVaultRoutes';

const PROTECTED_REQUESTS = [
    {
        method: 'POST',
        path: '/vault/list',
        reachedStatus: 200,
    },
    {
        method: 'POST',
        path: '/vault-file-resource',
        reachedStatus: 400,
    },
    {
        method: 'POST',
        path: '/tasks',
        reachedStatus: 400,
    },
    {
        method: 'POST',
        path: '/short_links',
        reachedStatus: 400,
    },
    {
        method: 'GET',
        path: '/short_links/abc',
        reachedStatus: 404,
    },
    {
        method: 'GET',
        path: '/milestones',
        reachedStatus: 200,
    },
    {
        method: 'GET',
        path: '/public-static/index.html',
        reachedStatus: 404,
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
        credentials: new Signal(parseTlsCredentials(files)),
    });
}

beforeAll(async () => {
    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    protectedServer = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials: new Signal(parseTlsCredentials(serverFiles)),
    }) as unknown as FastifyInstance;
    registerProtectedVaultRoutes(protectedServer);
    publicServer = Fastify({
        loggerInstance: logger,
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
    // The requests carry no valid input, so the status is what the route itself answers to them.
    it.each(PROTECTED_REQUESTS)('let the allowed service through to the route: $method $path', async ({
        method, path, reachedStatus,
    }) => {
        const response = await allowedClient.fetch(`${protectedOrigin}${path}`, { method });

        expect(response.status).toBe(reachedStatus);
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
