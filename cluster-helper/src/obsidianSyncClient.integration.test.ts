import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';

import { authenticateMtlsPeer, createMtlsServerOptions } from 'senaev-utils/src/utils/mtls/mtlsServer';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';

import {
    obsidianSyncFetch, startObsidianSyncClient, stopObsidianSyncClient,
} from './obsidianSyncClient';
import { proxyPublicStaticFile } from './publicStaticProxy';

const env = vi.hoisted(() => {
    return {
        OBSIDIAN_SYNC_URL: '',
    };
});
const mountedFiles = vi.hoisted(() => {
    return { client: undefined as TlsFiles | undefined };
});

vi.mock('./env', () => env);
vi.mock('senaev-utils/src/utils/mtls/tlsCredentials', async (importOriginal) => {
    return {
        ...await importOriginal<typeof import('senaev-utils/src/utils/mtls/tlsCredentials')>(),
        readTlsFiles: () => Promise.resolve(mountedFiles.client),
    };
});
vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
        },
    };
});

const CALLER_NAME = 'cluster-helper.test.svc.cluster.local';

let server: Server;
const requests: { url: string | undefined; authorization: string | undefined }[] = [];

beforeAll(async () => {
    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });

    mountedFiles.client = await issueTestCertificate({
        ca,
        dnsName: CALLER_NAME,
        usage: 'client',
    });
    server = createServer(createMtlsServerOptions(parseTlsCredentials(serverFiles)), (request, response) => {
        requests.push({
            url: request.url,
            authorization: request.headers.authorization,
        });

        const authentication = authenticateMtlsPeer(request.socket, new Date());

        if (!authentication.ok || !authentication.peer.hasDnsName(CALLER_NAME)) {
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
    env.OBSIDIAN_SYNC_URL = `https://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await stopObsidianSyncClient();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
});

describe('the obsidian-sync client over real mTLS', () => {
    it('refuses calls before it is started', async () => {
        await expect(obsidianSyncFetch(`${env.OBSIDIAN_SYNC_URL}/`)).rejects.toThrow('not started');
    });

    it('reaches the vault service with the client certificate and no token, and streams a static file', async () => {
        await startObsidianSyncClient();

        const result = await proxyPublicStaticFile({
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
