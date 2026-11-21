import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';

import { Agent, fetch as undiciFetch } from 'undici';
import {
    afterEach, describe, expect, it,
} from 'vitest';

import { createMtlsClient, type MtlsClient } from './mtlsClient';
import { authenticateMtlsPeer, createMtlsServerOptions } from './mtlsServer';
import {
    createTestCa, issueTestCertificate, renewTestCa,
} from './testPki';
import {
    createSecureContextOptions, parseTlsCredentials, type TlsFiles,
} from './tlsCredentials';

const CALLER_NAME = 'cluster-helper.test.svc.cluster.local';
const HOUR_MS = 3_600_000;

const servers: Server[] = [];
const clients: MtlsClient[] = [];

afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
    })));
});

async function startServer(files: TlsFiles, now: () => Date = () => new Date()): Promise<{ server: Server; origin: string }> {
    const server = createServer(createMtlsServerOptions(parseTlsCredentials(files)), (request, response) => {
        const authentication = authenticateMtlsPeer(request.socket, now());

        if (!authentication.ok) {
            response.statusCode = 401;
            response.end(authentication.reason);

            return;
        }

        response.statusCode = authentication.peer.hasName(CALLER_NAME) ? 200 : 403;
        response.end(response.statusCode === 200 ? 'ok' : 'forbidden');
    });

    servers.push(server);
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    return {
        server,
        origin: `https://localhost:${(server.address() as AddressInfo).port}`,
    };
}

function startClient(origin: string, files: TlsFiles): MtlsClient {
    // Not parseTlsCredentials: some cases need credentials that do not fit together.
    const client = createMtlsClient({
        origin,
        credentials: {
            ...files,
            validFrom: new Date(Date.now() - HOUR_MS),
            validTo: new Date(Date.now() + HOUR_MS),
        },
    });

    clients.push(client);

    return client;
}

async function createPki() {
    const ca = await createTestCa();

    return {
        ca,
        server: await issueTestCertificate({
            ca,
            dnsName: 'localhost',
            usage: 'server',
        }),
        client: await issueTestCertificate({
            ca,
            dnsName: CALLER_NAME,
            usage: 'client',
        }),
    };
}

describe('mTLS between a client and a server', () => {
    it('serves the allowed caller', async () => {
        const pki = await createPki();
        const { origin } = await startServer(pki.server);
        const response = await startClient(origin, pki.client).fetch(`${origin}/`);

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('ok');
    });

    it('refuses a client without a certificate', async () => {
        const pki = await createPki();
        const { origin } = await startServer(pki.server);
        const agent = new Agent({ connect: { ca: pki.ca.certificatePem } });

        await expect(undiciFetch(`${origin}/`, { dispatcher: agent })).rejects.toThrow();
        await agent.close();
    });

    it('refuses a client certificate of another CA', async () => {
        const pki = await createPki();
        const otherCa = await createTestCa('other-ca');
        const stranger = await issueTestCertificate({
            ca: otherCa,
            dnsName: CALLER_NAME,
            usage: 'client',
        });
        const { origin } = await startServer(pki.server);

        await expect(startClient(origin, {
            ...stranger,
            ca: pki.ca.certificatePem,
        }).fetch(`${origin}/`)).rejects.toThrow();
    });

    it('refuses a valid certificate that is only for servers', async () => {
        const pki = await createPki();
        const serverOnly = await issueTestCertificate({
            ca: pki.ca,
            dnsName: CALLER_NAME,
            usage: 'server',
        });
        const { origin } = await startServer(pki.server);

        await expect(startClient(origin, serverOnly).fetch(`${origin}/`)).rejects.toThrow();
    });

    it('denies another service of the same CA, after the handshake', async () => {
        const pki = await createPki();
        const other = await issueTestCertificate({
            ca: pki.ca,
            dnsName: 'other-service.test.svc.cluster.local',
            usage: 'client',
        });
        const { origin } = await startServer(pki.server);
        const response = await startClient(origin, other).fetch(`${origin}/`);

        expect(response.status).toBe(403);
        expect(await response.text()).toBe('forbidden');
    });

    it('denies a client whose certificate expired on a connection that is still open', async () => {
        const pki = await createPki();
        let now = new Date();
        const { origin } = await startServer(pki.server, () => now);
        const client = startClient(origin, pki.client);

        expect((await client.fetch(`${origin}/`)).status).toBe(200);
        now = new Date(Date.now() + 48 * HOUR_MS);

        const response = await client.fetch(`${origin}/`);

        expect(response.status).toBe(401);
        expect(await response.text()).toBe('The client certificate is expired');
    });

    it('refuses a server certificate for another host name', async () => {
        const pki = await createPki();
        const wrongHost = await issueTestCertificate({
            ca: pki.ca,
            dnsName: 'obsidian-sync.test.svc.cluster.local',
            usage: 'server',
        });
        const { origin } = await startServer(wrongHost);

        await expect(startClient(origin, pki.client).fetch(`${origin}/`)).rejects.toThrow();
    });

    it('keeps trusting leaves across a CA renewal that keeps the CA key, in both directions', async () => {
        const pki = await createPki();
        const renewedCa = await renewTestCa(pki.ca, { validTo: new Date(Date.now() + 100 * HOUR_MS) });
        const renewedServer = await issueTestCertificate({
            ca: renewedCa,
            dnsName: 'localhost',
            usage: 'server',
        });
        const renewedClient = await issueTestCertificate({
            ca: renewedCa,
            dnsName: CALLER_NAME,
            usage: 'client',
        });
        const oldServerNewClient = await startServer(pki.server);
        const newServerOldClient = await startServer({
            ...renewedServer,
            ca: renewedCa.certificatePem,
        });

        expect((await startClient(oldServerNewClient.origin, {
            ...renewedClient,
            ca: renewedCa.certificatePem,
        }).fetch(`${oldServerNewClient.origin}/`)).status).toBe(200);
        expect((await startClient(newServerOldClient.origin, pki.client).fetch(`${newServerOldClient.origin}/`)).status).toBe(200);
    });

    it('refuses a server certificate of another CA', async () => {
        const pki = await createPki();
        const otherCa = await createTestCa('other-ca');
        const impostor = await issueTestCertificate({
            ca: otherCa,
            dnsName: 'localhost',
            usage: 'server',
        });
        const { origin } = await startServer(impostor);

        await expect(startClient(origin, pki.client).fetch(`${origin}/`)).rejects.toThrow();
    });

    it('does not send the certificate to another origin or follow a redirect', async () => {
        const pki = await createPki();
        const { server, origin } = await startServer(pki.server);
        const client = startClient(origin, pki.client);

        await expect(client.fetch('https://localhost:1/')).rejects.toThrow('Refusing to send the client certificate');
        server.removeAllListeners('request');
        server.on('request', (_request, response) => {
            response.statusCode = 302;
            response.setHeader('location', 'https://example.com/');
            response.end();
        });
        await expect(client.fetch(`${origin}/`)).rejects.toThrow();
    });

    it('uses renewed certificates for new connections without a restart', async () => {
        const pki = await createPki();
        const { server, origin } = await startServer(pki.server);
        const client = startClient(origin, pki.client);

        expect((await client.fetch(`${origin}/`)).status).toBe(200);

        const renewedCa = await createTestCa('renewed-ca');
        const renewedServer = await issueTestCertificate({
            ca: renewedCa,
            dnsName: 'localhost',
            usage: 'server',
        });
        const renewedClient = await issueTestCertificate({
            ca: renewedCa,
            dnsName: CALLER_NAME,
            usage: 'client',
        });

        await expect(startClient(origin, renewedClient).fetch(`${origin}/`)).rejects.toThrow();

        server.setSecureContext(createSecureContextOptions(renewedServer));
        client.updateCredentials(parseTlsCredentials(renewedClient));

        expect((await client.fetch(`${origin}/`)).status).toBe(200);
    });
});
