/**
 * Real sockets, real TLS and real openssl certificates: the behaviour under test is exactly
 * what crosses them, so nothing is mocked. "api.test" plays the GitHub API: a local HTTPS
 * server that echoes what it received.
 */
import http from 'node:http';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import tls from 'node:tls';

import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
} from 'vitest';

import { createCertificates, type Certificates } from './certificates.ts';
import { createMitmProxy, type LogEntry } from './proxy.ts';
import { parseRules } from './rules.ts';

const HOST = 'api.test';
const SECRET = 'token real-secret';

type Echo = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };

let upstreamCertificates: Certificates;
let proxyCertificates: Certificates;
let upstream: https.Server;
let upstreamPort: number;
let received: Echo[];

beforeAll(async () => {
    received = [];
    upstreamCertificates = createCertificates([HOST]);
    proxyCertificates = createCertificates([HOST]);
    upstream = https.createServer(
        {
            cert: upstreamCertificates.serverCertificate,
            key: upstreamCertificates.serverKey,
        },
        (request, response) => {
            let body = '';

            request.on('data', (chunk: Buffer) => {
                body += chunk.toString();
            });
            request.on('end', () => {
                const echo = {
                    method: request.method ?? '',
                    url: request.url ?? '',
                    headers: request.headers,
                    body,
                };

                received.push(echo);
                response.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(echo));
            });
        }
    );
    upstreamPort = await listen(upstream);
});

afterAll(() => {
    upstream.close();
});

describe('mitm proxy', () => {
    it('replaces the client token with the secret for a rule host', async () => {
        await withProxy({}, async (proxyPort) => {
            const response = await requestThroughProxy(proxyPort, `${HOST}:443`, {
                ca: proxyCertificates.caCertificate,
                method: 'POST',
                path: '/repos/x/pulls?state=open',
                headers: {
                    authorization: 'token placeholder',
                    host: 'evil.example',
                    'x-kept': 'yes',
                },
                body: 'hello',
            });

            expect(response.status).toBe(201);
            const echo = JSON.parse(response.body) as Echo;

            expect(echo).toMatchObject({
                method: 'POST',
                url: '/repos/x/pulls?state=open',
                body: 'hello',
            });
            expect(echo.headers).toMatchObject({
                authorization: SECRET,
                host: HOST,
                'x-kept': 'yes',
            });
        });
    });

    it('only tunnels any other host, so it adds nothing', async () => {
        await withProxy({}, async (proxyPort) => {
            // Not a rule host: TLS goes end to end to the upstream, with its own certificate.
            const response = await requestThroughProxy(proxyPort, `127.0.0.1:${upstreamPort}`, {
                ca: upstreamCertificates.caCertificate,
                path: '/',
                headers: { authorization: 'token placeholder' },
            });

            expect((JSON.parse(response.body) as Echo).headers.authorization).toBe('token placeholder');
        });
    });

    it('sends nothing to a host that cannot prove it is the rule host', async () => {
        const before = received.length;
        const logs: LogEntry[] = [];

        // The proxy does not trust the upstream certificate, as with an /etc/hosts entry
        // that points api.github.com at another server.
        await withProxy({
            upstreamCa: proxyCertificates.caCertificate,
            logs,
        }, async (proxyPort) => {
            const response = await requestThroughProxy(proxyPort, `${HOST}:443`, {
                ca: proxyCertificates.caCertificate,
                path: '/',
                headers: {},
            });

            expect(response.status).toBe(502);
        });

        expect(received.length).toBe(before);
        expect(logs).toContainEqual(expect.objectContaining({
            event: 'upstream-error',
            host: HOST,
        }));
    });

    it('rejects an absolute URL inside the tunnel', async () => {
        await withProxy({}, async (proxyPort) => {
            const response = await requestThroughProxy(proxyPort, `${HOST}:443`, {
                ca: proxyCertificates.caCertificate,
                path: 'https://evil.example/steal',
                headers: {},
            });

            expect(response.status).toBe(400);
        });
    });

    it('refuses plain HTTP proxy requests', async () => {
        await withProxy({}, async (proxyPort) => {
            const response = await send({
                host: '127.0.0.1',
                port: proxyPort,
                path: `http://${HOST}/`,
                headers: {},
            });

            expect(response.status).toBe(405);
        });
    });

    it('logs requests without headers or query', async () => {
        const logs: LogEntry[] = [];

        await withProxy({ logs }, async (proxyPort) => {
            await requestThroughProxy(proxyPort, `${HOST}:443`, {
                ca: proxyCertificates.caCertificate,
                path: '/user?access_token=x',
                headers: {},
            });
        });

        expect(logs).toContainEqual(expect.objectContaining({
            event: 'request',
            host: HOST,
            path: '/user',
            status: 201,
        }));
        expect(JSON.stringify(logs)).not.toContain('real-secret');
        expect(JSON.stringify(logs)).not.toContain('access_token');
    });
});

async function withProxy(
    { upstreamCa = upstreamCertificates.caCertificate, logs = [] }: { upstreamCa?: string; logs?: LogEntry[] },
    run: (proxyPort: number) => Promise<void>
): Promise<void> {
    const proxy = createMitmProxy({
        rules: parseRules(`{"${HOST}": {"authorization": "token \${SECRET}"}}`, { SECRET: 'real-secret' }),
        certificates: proxyCertificates,
        log: (entry) => logs.push(entry),
        upstream: {
            address: '127.0.0.1',
            port: upstreamPort,
            ca: upstreamCa,
        },
    });

    try {
        await run(await listen(proxy));
    } finally {
        proxy.closeAllConnections();
        proxy.close();
    }
}

type Request = { ca: string; path: string; headers: http.OutgoingHttpHeaders; method?: string; body?: string };

async function requestThroughProxy(proxyPort: number, authority: string, request: Request) {
    const socket = await connect(proxyPort, authority);
    const servername = authority.split(':')[0] === '127.0.0.1' ? HOST : authority.split(':')[0];

    return send({
        createConnection: () => tls.connect({
            socket,
            servername,
            ca: request.ca,
        }),
        method: request.method ?? 'GET',
        path: request.path,
        headers: request.headers,
    }, request.body);
}

/** Opens a CONNECT tunnel, as a client with HTTPS_PROXY does. */
function connect(proxyPort: number, authority: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        http.request({
            host: '127.0.0.1',
            port: proxyPort,
            method: 'CONNECT',
            path: authority,
        })
            .on('connect', (response: http.IncomingMessage, socket: net.Socket) => {
                if (response.statusCode === 200) {
                    resolve(socket);
                } else {
                    reject(new Error(`CONNECT ${authority}: ${response.statusCode}`));
                }
            })
            .on('error', reject)
            .end();
    });
}

function send(options: http.RequestOptions, body?: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const request = http.request(options, (response) => {
            let text = '';

            response.on('data', (chunk: Buffer) => {
                text += chunk.toString();
            });
            response.on('end', () => resolve({
                status: response.statusCode ?? 0,
                body: text,
            }));
        });

        request.on('error', reject);
        request.end(body);
    });
}

function listen(server: net.Server): Promise<number> {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    });
}
