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
import { createTestRepositories, type TestRepositories } from '../tools/createTestRepositories';

import { CLUSTER_HELPER } from './callers';
import { registerProtectedCodeToolsRoutes } from './registerProtectedCodeToolsRoutes';

let repos: TestRepositories;
let server: FastifyInstance;
let origin: string;
let allowedClient: MtlsClient;
let otherServiceClient: MtlsClient;

function createClient(files: TlsFiles): MtlsClient {
    return createMtlsClient({
        origin,
        credentials: new Signal(parseTlsCredentials(files)),
    });
}

beforeAll(async () => {
    repos = await createTestRepositories({ demo: { 'README.md': 'hello\n' } });

    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });

    // Only the raw server type (HTTPS) differs from the plain instance; the routes do not use it.
    server = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials: new Signal(parseTlsCredentials(serverFiles)),
    }) as unknown as FastifyInstance;
    registerProtectedCodeToolsRoutes(server, repos.config);
    await server.listen({
        port: 0,
        host: '127.0.0.1',
    });
    origin = `https://localhost:${(server.server.address() as AddressInfo).port}`;
    allowedClient = createClient(await issueTestCertificate({
        ca,
        dnsName: CLUSTER_HELPER,
        usage: 'client',
    }));
    otherServiceClient = createClient(await issueTestCertificate({
        ca,
        dnsName: 'vpn-subscription.test.svc.cluster.local',
        usage: 'client',
    }));
});

afterAll(async () => {
    await Promise.all([
        allowedClient.close(),
        otherServiceClient.close(),
        server.close(),
    ]);
    await repos.remove();
});

function listRequest(): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: repos.root }),
    };
}

describe('protected code tools routes', () => {
    it('run a tool for cluster-helper', async () => {
        const response = await allowedClient.fetch(`${origin}/code/list`, listRequest());

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ status: 'ok' });
    });

    it('refuse another service with a valid certificate, also on an unknown path', async () => {
        expect((await otherServiceClient.fetch(`${origin}/code/list`, listRequest())).status).toBe(403);
        expect((await otherServiceClient.fetch(`${origin}/no-such-route`)).status).toBe(403);
    });

    it('refuse a caller without a certificate at the handshake', async () => {
        await expect(fetch(`${origin}/code/list`, listRequest())).rejects.toThrow();
    });
});
