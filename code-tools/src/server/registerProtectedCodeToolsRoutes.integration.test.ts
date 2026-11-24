import type { AddressInfo } from 'node:net';

import { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import {
    CONNECTION_CLOSED_BY_SERVER, createTestCa, fetchWithoutClientCertificate, issueTestCertificate, type TestCa,
} from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { createTestRepositories, type TestRepositories } from '../tools/createTestRepositories';

import { CLUSTER_HELPER } from './callers';
import { BODY_LIMIT_BYTES, createCodeToolsMtlsServer } from './createCodeToolsMtlsServer';

let repos: TestRepositories;
let server: ReturnType<typeof createCodeToolsMtlsServer>;
let origin: string;
let testCa: TestCa;
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

    testCa = ca;

    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });

    server = createCodeToolsMtlsServer(new Signal(parseTlsCredentials(serverFiles)), repos.config);
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

    it('accept a body over the default Fastify limit of 1 MiB', async () => {
        const response = await allowedClient.fetch(`${origin}/code/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: repos.root,
                padding: 'a'.repeat(2 * 1024 * 1024),
            }),
        });

        expect(server.initialConfig.bodyLimit).toBe(BODY_LIMIT_BYTES);
        expect(response.status).not.toBe(413);
    });

    it('refuse a caller without a certificate at the handshake', async () => {
        await expect(fetchWithoutClientCertificate(`${origin}/code/list`, testCa, listRequest())).rejects.toMatchObject({ cause: { code: CONNECTION_CLOSED_BY_SERVER } });
    });
});
