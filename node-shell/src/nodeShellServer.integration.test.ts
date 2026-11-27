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

import { CLUSTER_HELPER } from './callers';
import type { ExecutionManager } from './executionManager';
import type { ExecutionRecord } from './executionRecord';
import { createNodeShellServer } from './nodeShellServer';

const record: ExecutionRecord = {
    executionId: 'e1',
    host: 'hetzner',
    requestHash: 'internal',
    status: 'running',
    startedAt: '2026-11-22T10:00:00.000Z',
    endsBy: '2026-11-22T10:01:40.000Z',
};

const manager = {
    start: vi.fn<ExecutionManager['start']>(),
    get: vi.fn<ExecutionManager['get']>(),
    idle: vi.fn<ExecutionManager['idle']>(),
};

let server: ReturnType<typeof createNodeShellServer>;
let origin: string;
let testCa: TestCa;
let clusterHelperClient: MtlsClient;
let otherServiceClient: MtlsClient;

function createClient(files: TlsFiles): MtlsClient {
    return createMtlsClient({
        origin,
        credentials: new Signal(parseTlsCredentials(files)),
    });
}

function put(body: unknown): RequestInit {
    return {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    };
}

const validBody = {
    host: 'hetzner',
    command: 'hostname',
    timeoutSeconds: 30,
};

beforeAll(async () => {
    testCa = await createTestCa();
    server = createNodeShellServer(new Signal(parseTlsCredentials(await issueTestCertificate({
        ca: testCa,
        dnsName: 'localhost',
        usage: 'server',
    }))), manager);
    await server.listen({
        port: 0,
        host: '127.0.0.1',
    });
    origin = `https://localhost:${(server.server.address() as AddressInfo).port}`;
    clusterHelperClient = createClient(await issueTestCertificate({
        ca: testCa,
        dnsName: CLUSTER_HELPER,
        usage: 'client',
    }));
    otherServiceClient = createClient(await issueTestCertificate({
        ca: testCa,
        dnsName: 'senaev-code-tools.senaev-com.svc.cluster.local',
        usage: 'client',
    }));
});

beforeEach(() => {
    manager.start.mockReset();
    manager.get.mockReset();
});

afterAll(async () => {
    await Promise.all([
        clusterHelperClient.close(),
        otherServiceClient.close(),
        server.close(),
    ]);
});

describe('createNodeShellServer', () => {
    it('starts a command for cluster-helper and answers 202 without the internal hash', async () => {
        manager.start.mockResolvedValue({
            kind: 'started',
            record,
        });

        const response = await clusterHelperClient.fetch(`${origin}/executions/e1`, put(validBody));

        expect(response.status).toBe(202);
        await expect(response.json()).resolves.toEqual({
            execution: {
                executionId: 'e1',
                host: 'hetzner',
                status: 'running',
                startedAt: '2026-11-22T10:00:00.000Z',
                endsBy: '2026-11-22T10:01:40.000Z',
            },
        });
        expect(manager.start).toHaveBeenCalledExactlyOnceWith({
            executionId: 'e1',
            ...validBody,
        });
    });

    it.each([
        [
            'existing',
            200,
        ],
        [
            'conflict',
            409,
        ],
        [
            'unknown-host',
            400,
        ],
        [
            'hosts-unavailable',
            503,
        ],
        [
            'busy',
            429,
        ],
    ] as const)('answers a %s start with %i', async (kind, status) => {
        manager.start.mockResolvedValue(kind === 'existing'
            ? {
                kind,
                record,
            }
            : { kind });

        const response = await clusterHelperClient.fetch(`${origin}/executions/e1`, put(validBody));

        expect(response.status).toBe(status);
    });

    it.each([
        [
            'an empty command',
            {
                ...validBody,
                command: '',
            },
        ],
        [
            'a timeout over an hour',
            {
                ...validBody,
                timeoutSeconds: 3601,
            },
        ],
        [
            'a fractional timeout',
            {
                ...validBody,
                timeoutSeconds: 1.5,
            },
        ],
        [
            'no host',
            {
                command: 'id',
                timeoutSeconds: 1,
            },
        ],
    ])('answers 400 to %s and starts nothing', async (_case, body) => {
        const response = await clusterHelperClient.fetch(`${origin}/executions/e1`, put(body));

        expect(response.status).toBe(400);
        expect(manager.start).not.toHaveBeenCalled();
    });

    it('answers 400 to an execution ID that is not safe as a unit name', async () => {
        const response = await clusterHelperClient.fetch(`${origin}/executions/a.b_c`, put(validBody));

        expect(response.status).toBe(400);
        expect(manager.start).not.toHaveBeenCalled();
    });

    it('returns a saved execution, and 404 for an unknown one', async () => {
        manager.get.mockImplementation((executionId) => Promise.resolve(executionId === 'e1'
            ? {
                ...record,
                status: 'completed',
                exitCode: 0,
                stdout: 'hetzner\n',
            }
            : undefined));

        const found = await clusterHelperClient.fetch(`${origin}/executions/e1`);
        const missing = await clusterHelperClient.fetch(`${origin}/executions/e2`);

        expect(found.status).toBe(200);
        await expect(found.json()).resolves.toMatchObject({
            execution: {
                status: 'completed',
                exitCode: 0,
                stdout: 'hetzner\n',
            },
        });
        expect(missing.status).toBe(404);
    });

    it('refuses another service with a valid certificate and starts nothing', async () => {
        const response = await otherServiceClient.fetch(`${origin}/executions/e1`, put(validBody));

        expect(response.status).toBe(403);
        expect(manager.start).not.toHaveBeenCalled();
    });

    it('refuses a caller without a certificate at the handshake', async () => {
        await expect(fetchWithoutClientCertificate(`${origin}/executions/e1`, testCa, put(validBody)))
            .rejects.toMatchObject({ cause: { code: CONNECTION_CLOSED_BY_SERVER } });
        expect(manager.start).not.toHaveBeenCalled();
    });
});
