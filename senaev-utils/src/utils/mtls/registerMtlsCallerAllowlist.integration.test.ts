import type { AddressInfo } from 'node:net';

import Fastify, { type FastifyInstance } from 'fastify';
import pino from 'pino';
import {
    afterAll, beforeAll, describe, expect, it,
} from 'vitest';

import { Signal } from '../Signal/Signal';

import { createMtlsFastifyServer } from './createMtlsFastifyServer';
import { createMtlsClient, type MtlsClient } from './mtlsClient';
import { registerMtlsCallerAllowlist } from './registerMtlsCallerAllowlist';
import { createTestCa, issueTestCertificate } from './testPki';
import { parseTlsCredentials, type TlsFiles } from './tlsCredentials';

const logger = pino({ level: 'silent' });

const SERVICE_A = 'service-a.test.svc.cluster.local';
const SERVICE_B = 'service-b.test.svc.cluster.local';
const SERVICE_C = 'service-c.test.svc.cluster.local';

const servers: FastifyInstance[] = [];
const clients: MtlsClient[] = [];
let serverFiles: TlsFiles;
let ca: Awaited<ReturnType<typeof createTestCa>>;

async function startServer(allowedCallers: readonly string[]): Promise<string> {
    // Only the raw server type (HTTPS) differs from the plain instance; the hooks do not use it.
    const server = createMtlsFastifyServer({
        Fastify,
        logger,
        credentials: new Signal(parseTlsCredentials(serverFiles)),
    }) as unknown as FastifyInstance;

    registerMtlsCallerAllowlist(server, allowedCallers);
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
        credentials: new Signal(parseTlsCredentials(await issueTestCertificate({
            ca,
            dnsName: serviceName,
            usage: 'client',
        }))),
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

describe('registerMtlsCallerAllowlist', () => {
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
        expect(await response.json()).toMatchObject({
            code: 'forbidden',
            message: 'This service is not allowed to call this API',
        });
        expect((await client.fetch(`${origin}/no-such-route`)).status).toBe(403);
    });

    it('denies every service when the list is empty', async () => {
        const origin = await startServer([]);

        expect((await (await startClient(origin, SERVICE_A)).fetch(`${origin}/route`)).status).toBe(403);
    });
});
