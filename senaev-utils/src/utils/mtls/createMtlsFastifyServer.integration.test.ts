import type { AddressInfo } from 'node:net';

import Fastify from 'fastify';
import pino from 'pino';
import {
    afterEach, describe, expect, it,
} from 'vitest';

import { Signal } from '../Signal/Signal';

import { createMtlsFastifyServer } from './createMtlsFastifyServer';
import { createMtlsClient, type MtlsClient } from './mtlsClient';
import { createTestCa, issueTestCertificate } from './testPki';
import { parseTlsCredentials } from './tlsCredentials';

const CALLER_NAME = 'caller.test.svc.cluster.local';

const servers: ReturnType<typeof createMtlsFastifyServer>[] = [];
const clients: MtlsClient[] = [];

afterEach(async () => {
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
