import {
    mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkMtlsPeer, createMtlsServerOptions } from 'senaev-utils/src/utils/mtls/mtlsServer';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsMaterial } from 'senaev-utils/src/utils/mtls/tlsMaterial';
import {
    afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';

import {
    obsidianSyncFetch, startObsidianSyncClient, stopObsidianSyncClient,
} from './obsidianSyncClient';
import { proxyPublicStaticFile } from './publicStaticProxy';

const env = vi.hoisted(() => {
    return {
        MTLS_DIR: '',
        OBSIDIAN_SYNC_URL: '',
    };
});

vi.mock('./env', () => env);
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
let directory: string;
const requests: { url: string | undefined; authorization: string | undefined }[] = [];

beforeAll(async () => {
    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });
    const clientFiles = await issueTestCertificate({
        ca,
        dnsName: CALLER_NAME,
        usage: 'client',
    });

    directory = await mkdtemp(join(tmpdir(), 'cluster-helper-mtls-'));
    await Promise.all([
        writeFile(join(directory, 'tls.key'), clientFiles.key),
        writeFile(join(directory, 'tls.crt'), clientFiles.cert),
        writeFile(join(directory, 'ca.crt'), clientFiles.ca),
    ]);
    server = createServer(createMtlsServerOptions(parseTlsMaterial(serverFiles)), (request, response) => {
        requests.push({
            url: request.url,
            authorization: request.headers.authorization,
        });

        if (!checkMtlsPeer(request.socket, CALLER_NAME, new Date()).ok) {
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
    env.MTLS_DIR = directory;
    env.OBSIDIAN_SYNC_URL = `https://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await stopObsidianSyncClient();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, {
        recursive: true,
        force: true,
    });
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
