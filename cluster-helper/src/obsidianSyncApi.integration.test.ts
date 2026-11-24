import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';

import { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { authenticateMtlsCaller, createMtlsServerOptions } from 'senaev-utils/src/utils/mtls/mtlsServer';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsCredentials } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';

import { createObsidianSyncApi } from './obsidianSyncApi';
import { proxyPublicStaticFile } from './publicStaticProxy';

const serviceUrls = vi.hoisted(() => {
    return {
        OBSIDIAN_SYNC_URL: '',
    };
});

vi.mock('./mtlsServiceUrls', () => serviceUrls);

const CALLER_NAME = 'cluster-helper.test.svc.cluster.local';

let server: Server;
let client: MtlsClient | undefined;
let clientCredentials: Signal<TlsCredentials>;
const requests: { url: string | undefined; authorization: string | undefined }[] = [];

beforeAll(async () => {
    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });

    clientCredentials = new Signal(parseTlsCredentials(await issueTestCertificate({
        ca,
        dnsName: CALLER_NAME,
        usage: 'client',
    })));
    server = createServer(createMtlsServerOptions(parseTlsCredentials(serverFiles)), (request, response) => {
        requests.push({
            url: request.url,
            authorization: request.headers.authorization,
        });

        const authentication = authenticateMtlsCaller(request.socket, new Date());

        if (!authentication.ok || !authentication.caller.hasDnsName(CALLER_NAME)) {
            response.statusCode = 401;
            response.end('unauthorized');

            return;
        }

        response.setHeader('content-type', 'text/plain');
        response.write('first chunk, ');
        response.end('second chunk');
    });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    serviceUrls.OBSIDIAN_SYNC_URL = `https://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await client?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
});

describe('the obsidian-sync API over real mTLS', () => {
    it('reaches the vault service with the client certificate and no token, and streams a static file', async () => {
        client = createMtlsClient({
            origin: serviceUrls.OBSIDIAN_SYNC_URL,
            credentials: clientCredentials,
        });

        const result = await proxyPublicStaticFile({
            obsidianSyncApi: createObsidianSyncApi(client),
            path: 'folder/file.txt',
            requestHeaders: {},
        });
        const chunks: Buffer[] = [];

        for await (const chunk of result.body as AsyncIterable<Buffer>) {
            chunks.push(Buffer.from(chunk));
        }

        expect(result.status).toBe(200);
        expect(Buffer.concat(chunks).toString()).toBe('first chunk, second chunk');
        expect(requests).toEqual([
            {
                url: '/public-static/folder/file.txt',
                authorization: undefined,
            },
        ]);
    });
});
