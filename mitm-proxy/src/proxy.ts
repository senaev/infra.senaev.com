import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import tls from 'node:tls';

import type { Certificates } from './certificates.ts';
import { HOP_BY_HOP_HEADERS, type HeaderRules } from './rules.ts';

export type LogEntry = Record<string, string | number>;

export type ProxyOptions = {
    rules: HeaderRules;
    certificates: Certificates;
    log: (entry: LogEntry) => void;
    /**
     * Tests only: send intercepted requests here instead of <host>:443, and trust this CA there.
     * The upstream certificate is checked against the host name either way.
     */
    upstream?: { address: string; port: number; ca: string };
};

const ESTABLISHED = 'HTTP/1.1 200 Connection Established\r\n\r\n';

/**
 * An HTTPS proxy (HTTPS_PROXY) that adds secret headers for some hosts.
 *
 * A client asks for a tunnel with CONNECT host:port.
 * - A host with rules, port 443: the proxy answers the TLS itself, with a certificate of its own
 *   CA, reads each request, sets the rule headers and sends it on to the real host over a new,
 *   verified TLS connection.
 * - Any other host: a plain tunnel. The proxy cannot read it and adds nothing.
 *
 * The secret never goes to the client, and goes only to a host that proves, with a certificate
 * trusted by the system, that it is that host. So pointing the host name somewhere else
 * (/etc/hosts, DNS) gets a TLS error, not the secret.
 */
export function createMitmProxy(options: ProxyOptions): http.Server {
    const secureContext = tls.createSecureContext({
        cert: options.certificates.serverCertificate,
        key: options.certificates.serverKey,
    });
    const forwarders = new Map([...options.rules].map(([
        host,
        headers,
    ]) => [
        host,
        createForwarder(host, headers, options),
    ]));

    // Requests without CONNECT would be plain HTTP; nothing here should travel unencrypted.
    const proxy = http.createServer((_request, response) => {
        response.writeHead(405, { 'content-type': 'text/plain' }).end('Use this proxy as HTTPS_PROXY (CONNECT).\n');
    });

    proxy.on('connect', (request: http.IncomingMessage, client: Duplex, head: Buffer) => {
        const target = parseAuthority(request.url ?? '');

        if (!target) {
            client.end('HTTP/1.1 400 Bad Request\r\n\r\n');

            return;
        }

        const forwarder = target.port === 443 ? forwarders.get(target.host) : undefined;

        if (forwarder) {
            intercept(client, head, secureContext, forwarder);
        } else {
            tunnel(client, head, target, options.log);
        }
    });

    return proxy;
}

function intercept(client: Duplex, head: Buffer, secureContext: tls.SecureContext, forwarder: http.Server): void {
    client.write(ESTABLISHED);

    if (head.length > 0) {
        client.unshift(head);
    }

    const tlsSocket = new tls.TLSSocket(client as net.Socket, {
        isServer: true,
        secureContext,
    });

    // For example a client that does not trust the proxy CA: it closes the handshake.
    tlsSocket.on('error', () => tlsSocket.destroy());
    forwarder.emit('connection', tlsSocket);
}

/** Reads the decrypted requests for one host and sends them to the real host with the rule headers. */
function createForwarder(host: string, ruleHeaders: Readonly<Record<string, string>>, options: ProxyOptions): http.Server {
    const agent = new https.Agent({ keepAlive: true });
    const destination = options.upstream
        ? {
            host: options.upstream.address,
            port: options.upstream.port,
            ca: options.upstream.ca,
        }
        : {
            host,
            port: 443,
        };

    return http.createServer((request, response) => {
        // Only "/path": an absolute URL ("https://other.host/...") here could name another host.
        if (!request.url?.startsWith('/')) {
            response.writeHead(400).end();

            return;
        }

        const startedAt = Date.now();
        const upstreamRequest = https.request({
            ...destination,
            servername: host,
            agent,
            method: request.method,
            path: request.url,
            headers: {
                ...withoutHopByHop(request.headers),
                host,
                ...ruleHeaders,
            },
        }, (upstreamResponse) => {
            response.writeHead(upstreamResponse.statusCode ?? 502, withoutHopByHop(upstreamResponse.headers));
            upstreamResponse.pipe(response);
            // No headers and no query: they can hold tokens.
            options.log({
                event: 'request',
                host,
                method: request.method ?? '',
                path: request.url?.split('?')[0] ?? '',
                status: upstreamResponse.statusCode ?? 0,
                ms: Date.now() - startedAt,
            });
        });

        upstreamRequest.on('error', (error) => {
            options.log({
                event: 'upstream-error',
                host,
                error: error.message,
            });

            if (response.headersSent) {
                response.destroy();
            } else {
                response.writeHead(502).end();
            }
        });

        request.pipe(upstreamRequest);
    });
}

function tunnel(client: Duplex, head: Buffer, target: Authority, log: ProxyOptions['log']): void {
    let connected = false;
    const upstream = net.connect(target.port, target.host, () => {
        connected = true;
        client.write(ESTABLISHED);
        upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
    });

    upstream.on('error', (error) => {
        log({
            event: 'tunnel-error',
            host: target.host,
            port: target.port,
            error: error.message,
        });

        if (connected) {
            client.destroy();
        } else {
            client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        }
    });
    client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy());
}

type Authority = { host: string; port: number };

/** "host:port" or "[ipv6]:port" from CONNECT. Host names are compared in lower case. */
export function parseAuthority(authority: string): Authority | undefined {
    const match = /^(?:\[([0-9a-f:.]+)\]|([a-z0-9.-]+)):(\d{1,5})$/i.exec(authority);
    const host = match?.[1] ?? match?.[2];
    const port = Number(match?.[3]);

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        return undefined;
    }

    return {
        host: host.toLowerCase(),
        port,
    };
}

function withoutHopByHop<T extends http.IncomingHttpHeaders>(headers: T): T {
    return Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP_HEADERS.has(name))) as T;
}
