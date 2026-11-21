import type { AddressInfo } from 'node:net';

import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { createProtectedVaultServer, type VaultServer } from './createVaultServer';
import { registerMtlsAuthorization, registerRoutesForCallers } from './registerMtlsAuthorization';

const SERVICE_A = 'service-a.test.svc.cluster.local';
const SERVICE_B = 'service-b.test.svc.cluster.local';

let server: VaultServer;
let origin: string;
let clientA: MtlsClient;
let clientB: MtlsClient;

function createClient(files: TlsFiles): MtlsClient {
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

    server = createProtectedVaultServer(parseTlsCredentials(serverFiles)).server;
    registerMtlsAuthorization(server);
    registerRoutesForCallers(server, [SERVICE_A], (scope) => {
        scope.get('/only-a', () => 'a');
    });
    registerRoutesForCallers(server, [
        SERVICE_A,
        SERVICE_B,
    ], (scope) => {
        scope.get('/a-and-b', () => 'ab');
    });
    server.get('/undeclared', () => 'nobody');
    await server.listen({
        port: 0,
        host: '127.0.0.1',
    });
    origin = `https://localhost:${(server.server.address() as AddressInfo).port}`;
    clientA = createClient(await issueTestCertificate({
        ca,
        dnsName: SERVICE_A,
        usage: 'client',
    }));
    clientB = createClient(await issueTestCertificate({
        ca,
        dnsName: SERVICE_B,
        usage: 'client',
    }));
});

afterAll(async () => {
    await Promise.all([
        clientA.close(),
        clientB.close(),
        server.close(),
    ]);
});

describe('registerMtlsAuthorization', () => {
    it('lets a service call a route that names it', async () => {
        expect((await clientA.fetch(`${origin}/only-a`)).status).toBe(200);
        expect((await clientA.fetch(`${origin}/a-and-b`)).status).toBe(200);
        expect((await clientB.fetch(`${origin}/a-and-b`)).status).toBe(200);
    });

    it('denies a service with a valid certificate on a route that does not name it', async () => {
        const response = await clientB.fetch(`${origin}/only-a`);

        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 'forbidden' });
    });

    it('denies every service on a route that names no service', async () => {
        expect((await clientA.fetch(`${origin}/undeclared`)).status).toBe(403);
        expect((await clientB.fetch(`${origin}/undeclared`)).status).toBe(403);
    });

    it('denies every service on an unknown path', async () => {
        expect((await clientA.fetch(`${origin}/no-such-route`)).status).toBe(403);
    });
});
