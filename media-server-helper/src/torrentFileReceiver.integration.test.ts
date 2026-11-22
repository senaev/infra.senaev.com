import type { AddressInfo } from 'node:net';

import { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import { createTestCa, issueTestCertificate } from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { CLUSTER_HELPER } from './callers';
import { createTorrentFileReceiver } from './torrentFileReceiver';

const writeFile = vi.fn<(buffer: Buffer, fileName: string) => string>();

let server: ReturnType<typeof createTorrentFileReceiver>;
let origin: string;
let clusterHelperClient: MtlsClient;
let otherServiceClient: MtlsClient;

function createClient(files: TlsFiles): MtlsClient {
    return createMtlsClient({
        origin,
        credentials: new Signal(parseTlsCredentials(files)),
    });
}

function postTorrentFile(body: unknown): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

beforeAll(async () => {
    const ca = await createTestCa();
    const serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });

    server = createTorrentFileReceiver(new Signal(parseTlsCredentials(serverFiles)), writeFile);
    await server.listen({
        port: 0,
        host: '127.0.0.1',
    });
    origin = `https://localhost:${(server.server.address() as AddressInfo).port}`;
    clusterHelperClient = createClient(await issueTestCertificate({
        ca,
        dnsName: CLUSTER_HELPER,
        usage: 'client',
    }));
    otherServiceClient = createClient(await issueTestCertificate({
        ca,
        dnsName: 'vpn-subscription.vpn.svc.cluster.local',
        usage: 'client',
    }));
});

beforeEach(() => {
    writeFile.mockReset().mockReturnValue('/torrents/a.torrent');
});

afterAll(async () => {
    await Promise.all([
        clusterHelperClient.close(),
        otherServiceClient.close(),
        server.close(),
    ]);
});

describe('createTorrentFileReceiver', () => {
    it('writes the file that cluster-helper sends', async () => {
        const response = await clusterHelperClient.fetch(`${origin}/torrent-files`, postTorrentFile({
            fileName: 'a.torrent',
            contentBase64: Buffer.from('data').toString('base64'),
        }));

        expect(response.status).toBe(200);
        expect(writeFile).toHaveBeenCalledExactlyOnceWith(Buffer.from('data'), 'a.torrent');
    });

    it('accepts an encoded torrent larger than Fastify’s default request limit', async () => {
        const file = Buffer.alloc(800 * 1024, 1);
        const response = await clusterHelperClient.fetch(`${origin}/torrent-files`, postTorrentFile({
            fileName: 'large.torrent',
            contentBase64: file.toString('base64'),
        }));

        expect(server.initialConfig.bodyLimit).toBe(50 * 1024 * 1024);
        expect(response.status).toBe(200);
        expect(writeFile).toHaveBeenCalledExactlyOnceWith(expect.any(Buffer), 'large.torrent');
        expect(writeFile.mock.lastCall?.[0].equals(file)).toBe(true);
    });

    it('answers 400 to an invalid body and to an empty file, and writes nothing', async () => {
        const invalid = await clusterHelperClient.fetch(`${origin}/torrent-files`, postTorrentFile({ fileName: 'a.torrent' }));
        const empty = await clusterHelperClient.fetch(`${origin}/torrent-files`, postTorrentFile({
            fileName: 'a.torrent',
            contentBase64: '',
        }));

        expect(invalid.status).toBe(400);
        expect(empty.status).toBe(400);
        expect(writeFile).not.toHaveBeenCalled();
    });

    it('refuses another service with a valid certificate and writes nothing', async () => {
        const response = await otherServiceClient.fetch(`${origin}/torrent-files`, postTorrentFile({
            fileName: 'a.torrent',
            contentBase64: Buffer.from('data').toString('base64'),
        }));

        expect(response.status).toBe(403);
        expect(writeFile).not.toHaveBeenCalled();
    });

    it('refuses a caller without a certificate at the handshake', async () => {
        await expect(fetch(`${origin}/torrent-files`, postTorrentFile({}))).rejects.toThrow();
    });
});
