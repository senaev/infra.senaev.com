import type { AddressInfo } from 'node:net';

import Fastify from 'fastify';
import pino from 'pino';
import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { Signal } from '../Signal/Signal';

import { createMtlsFastifyServer } from './createMtlsFastifyServer';
import { createMtlsClient, type MtlsClient } from './mtlsClient';
import type { FastifyRequestWithMtls } from './registerMtlsAuthentication';
import { createTestCa, issueTestCertificate } from './testPki';
import { parseTlsCredentials } from './tlsCredentials';

const CALLER_NAME = 'caller.test.svc.cluster.local';

const servers: ReturnType<typeof createMtlsFastifyServer>[] = [];
const clients: MtlsClient[] = [];

afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function issuePair(ca: Awaited<ReturnType<typeof createTestCa>>) {
    return {
        server: parseTlsCredentials(await issueTestCertificate({
            ca,
            dnsName: 'localhost',
            usage: 'server',
        })),
        client: parseTlsCredentials(await issueTestCertificate({
            ca,
            dnsName: CALLER_NAME,
            usage: 'client',
        })),
    };
}

describe('createMtlsFastifyServer', () => {
    it('gives the routes the caller of a valid certificate, and answers 401 once the certificate has expired on an open connection', async () => {
        const pair = await issuePair(await createTestCa());
        const server = createMtlsFastifyServer({
            Fastify,
            logger: pino({ level: 'silent' }),
            credentials: new Signal(pair.server),
        });

        servers.push(server);
        server.get('/', (request) => String((request as FastifyRequestWithMtls).mtlsCaller?.hasDnsName(CALLER_NAME)));
        await server.listen({
            port: 0,
            host: '127.0.0.1',
        });

        const origin = `https://localhost:${(server.server.address() as AddressInfo).port}`;
        const client = createMtlsClient({
            origin,
            credentials: new Signal(pair.client),
        });

        clients.push(client);

        const valid = await client.fetch(`${origin}/`);

        expect(valid.status).toBe(200);
        expect(await valid.text()).toBe('true');

        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(pair.client.validTo.getTime() + 1000);

        const expired = await client.fetch(`${origin}/`);

        expect(expired.status).toBe(401);
        expect(await expired.json()).toMatchObject({ message: 'The client certificate is expired' });
    });

    it('serves a client with a certificate of the CA, and takes a renewal from the signal for new connections', async () => {
        const first = await issuePair(await createTestCa());
        const renewed = await issuePair(await createTestCa('renewed-ca'));
        const serverCredentials = new Signal(first.server);
        const server = createMtlsFastifyServer({
            Fastify,
            logger: pino({ level: 'silent' }),
            credentials: serverCredentials,
        });

        servers.push(server);
        server.get('/', () => 'ok');
        await server.listen({
            port: 0,
            host: '127.0.0.1',
        });

        const origin = `https://localhost:${(server.server.address() as AddressInfo).port}`;
        const clientCredentials = new Signal(first.client);
        const client = createMtlsClient({
            origin,
            credentials: clientCredentials,
        });

        clients.push(client);
        expect((await client.fetch(`${origin}/`)).status).toBe(200);

        serverCredentials.dispatch(renewed.server);
        clientCredentials.dispatch(renewed.client);

        expect((await client.fetch(`${origin}/`)).status).toBe(200);
    });
});
