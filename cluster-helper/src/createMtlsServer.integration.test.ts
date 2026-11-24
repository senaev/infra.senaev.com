import type { AddressInfo } from 'node:net';

import { Signal } from 'senaev-utils/src/utils/Signal/Signal';
import { createMtlsClient, type MtlsClient } from 'senaev-utils/src/utils/mtls/mtlsClient';
import {
    CONNECTION_CLOSED_BY_SERVER, createTestCa, fetchWithoutClientCertificate, issueTestCertificate, type TestCa,
} from 'senaev-utils/src/utils/mtls/testPki';
import { parseTlsCredentials, type TlsFiles } from 'senaev-utils/src/utils/mtls/tlsCredentials';
import {
    afterAll, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { VPN_SUBSCRIPTION } from './callers';
import { createMtlsServer } from './createMtlsServer';

const sendTelegramMessage = vi.hoisted(() => vi.fn());

vi.mock('senaev-utils/src/utils/TelegramApi/sendTelegramMessage', () => {
    return { sendTelegramMessage };
});
vi.mock('./env', () => {
    return { TG_TOKEN_SENAEV_COM_BOT: 'bot-token' };
});

const MESSAGE = {
    chatId: '42',
    text: 'hello',
};

let server: ReturnType<typeof createMtlsServer>;
let origin: string;
let testCa: TestCa;
let vpnSubscriptionClient: MtlsClient;
let otherServiceClient: MtlsClient;
let serverFiles: TlsFiles;

function createClient(files: TlsFiles): MtlsClient {
    return createMtlsClient({
        origin,
        credentials: new Signal(parseTlsCredentials(files)),
    });
}

function sendMessageRequest(): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(MESSAGE),
    };
}

beforeAll(async () => {
    const ca = await createTestCa();

    testCa = ca;
    serverFiles = await issueTestCertificate({
        ca,
        dnsName: 'localhost',
        usage: 'server',
    });
    server = createMtlsServer(new Signal(parseTlsCredentials(serverFiles)));
    await server.listen({
        port: 0,
        host: '127.0.0.1',
    });
    origin = `https://localhost:${(server.server.address() as AddressInfo).port}`;
    vpnSubscriptionClient = createClient(await issueTestCertificate({
        ca,
        dnsName: VPN_SUBSCRIPTION,
        usage: 'client',
    }));
    otherServiceClient = createClient(await issueTestCertificate({
        ca,
        dnsName: 'obsidian-sync.senaev-com.svc.cluster.local',
        usage: 'client',
    }));
});

beforeEach(() => {
    sendTelegramMessage.mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
    await Promise.all([
        vpnSubscriptionClient.close(),
        otherServiceClient.close(),
        server.close(),
    ]);
});

describe('the mTLS server of cluster-helper', () => {
    it('sends a Telegram message for vpn-subscription with the bot token', async () => {
        const response = await vpnSubscriptionClient.fetch(`${origin}/telegram/send-message`, sendMessageRequest());

        expect(response.status).toBe(204);
        expect(sendTelegramMessage).toHaveBeenCalledExactlyOnceWith({
            ...MESSAGE,
            token: 'bot-token',
        });
    });

    it('refuses another service with a valid certificate and sends nothing', async () => {
        const response = await otherServiceClient.fetch(`${origin}/telegram/send-message`, sendMessageRequest());

        expect(response.status).toBe(403);
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    it('refuses a caller without a certificate at the handshake and sends nothing', async () => {
        await expect(fetchWithoutClientCertificate(`${origin}/telegram/send-message`, testCa, sendMessageRequest())).rejects.toMatchObject({ cause: { code: CONNECTION_CLOSED_BY_SERVER } });
        expect(sendTelegramMessage).not.toHaveBeenCalled();
    });

    it('has no other route for the allowed service', async () => {
        expect((await vpnSubscriptionClient.fetch(`${origin}/alertmanager/heartbeat`, { method: 'POST' })).status).toBe(404);
    });
});
