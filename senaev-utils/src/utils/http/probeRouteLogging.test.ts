import Fastify, { LogController } from 'fastify';
import pino from 'pino';
import {
    describe, expect, it,
} from 'vitest';

import { createProbeLogController } from './probeRouteLogging';

type LogLine = { msg: string; probe?: boolean; reqId?: string; level: number };

async function getRequestLogs(url: string): Promise<LogLine[]> {
    const lines: string[] = [];
    const logger = pino({}, {
        write: (line: string) => {
            lines.push(line);
        },
    });
    const server = Fastify({
        loggerInstance: logger,
        logController: createProbeLogController(LogController, [
            '/health',
            '/broken',
        ]),
    });

    server.get('/health', (_request, reply) => reply.send('ok'));
    server.get('/broken', () => {
        throw new Error('probe failed');
    });
    server.get('/work', (_request, reply) => reply.send('ok'));

    await server.inject({ url });
    await server.close();

    return lines
        .map((line) => JSON.parse(line) as LogLine)
        .filter(({ reqId }) => reqId !== undefined);
}

describe('createProbeLogController', () => {
    it('prefixes and marks the request lines of a probe path, also with a query', async () => {
        const logs = await getRequestLogs('/health?probe=1');

        expect(logs.map(({ msg }) => msg)).toEqual([
            '[probe] incoming request',
            '[probe] request completed',
        ]);
        expect(logs.every(({ probe }) => probe === true)).toBe(true);
    });

    it('leaves other paths unchanged', async () => {
        const logs = await getRequestLogs('/work');

        expect(logs.map(({ msg }) => msg)).toEqual([
            'incoming request',
            'request completed',
        ]);
        expect(logs.some(({ probe }) => probe !== undefined)).toBe(false);
    });

    it('keeps the default error lines of a failing probe', async () => {
        const logs = await getRequestLogs('/broken');

        expect(logs.map(({ msg }) => msg)).toEqual([
            '[probe] incoming request',
            'probe failed',
            'request completed',
        ]);
    });
});
