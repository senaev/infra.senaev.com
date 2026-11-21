import type { AddressInfo } from 'node:net';

import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { createProtectedVaultServer, type VaultServer } from './createVaultServer';
import { registerMtlsAuthentication } from './registerMtlsAuthentication';
import { registerMtlsAuthorization } from './registerMtlsAuthorization';

const SERVICE_A = 'service-a.test.svc.cluster.local';
const SERVICE_B = 'service-b.test.svc.cluster.local';
const SERVICE_C = 'service-c.test.svc.cluster.local';

const servers: VaultServer[] = [];
const clients: MtlsClient[] = [];
let serverFiles: TlsFiles;
let ca: Awaited<ReturnType<typeof createTestCa>>;

async function startServer(allowedCallers: readonly string[]): Promise<string> {
    const { server } = createProtectedVaultServer(parseTlsCredentials(serverFiles));

    registerMtlsAuthentication(server);
    registerMtlsAuthorization(server, allowedCallers);
    server.get('/route', () => 'ok');
    await server.listen({
        port: 0,
        host: '127.0.0.1',
    });
    servers.push(server);

    return `https://localhost:${(server.server.address() as AddressInfo).port}`;
}

async function startClient(origin: string, serviceName: string): Promise<MtlsClient> {
    const client = createMtlsClient({
        origin,
        credentials: parseTlsCredentials(await issueTestCertificate({
            ca,
            dnsName: serviceName,
            usage: 'client',
        })),
    });

    clients.push(client);

    return client;
}

beforeAll(async () => {
    ca = await createTestCa();
    serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });
});

afterAll(async () => {
    await Promise.all([
        ...clients.map((client) => client.close()),
        ...servers.map((server) => server.close()),
    ]);
});

describe('registerMtlsAuthorization', () => {
    it('lets every allowed service call a route', async () => {
        const origin = await startServer([
            SERVICE_A,
            SERVICE_B,
        ]);

        expect((await (await startClient(origin, SERVICE_A)).fetch(`${origin}/route`)).status).toBe(200);
        expect((await (await startClient(origin, SERVICE_B)).fetch(`${origin}/route`)).status).toBe(200);
    });

    it('denies a service with a valid certificate that is not on the list, on every path', async () => {
        const origin = await startServer([
            SERVICE_A,
            SERVICE_B,
        ]);
        const client = await startClient(origin, SERVICE_C);
        const response = await client.fetch(`${origin}/route`);

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'forbidden' });
        expect((await client.fetch(`${origin}/no-such-route`)).status).toBe(403);
    });

    it('denies every service when the list is empty', async () => {
        const origin = await startServer([]);

        expect((await (await startClient(origin, SERVICE_A)).fetch(`${origin}/route`)).status).toBe(403);
    });
});
