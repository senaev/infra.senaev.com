import Fastify from 'fastify';
import pino from 'pino';
import {
    describe, expect, it,
} from 'vitest';

import { createProbeRouteChildLoggerFactory } from './probeRouteLogging';

async function getRequestLogs(url: string): Promise<Array<{ msg: string; probe?: boolean }>> {
    const lines: string[] = [];
    const logger = pino({}, {
        write: (line: string) => {
            lines.push(line);
        },
    });
    const server = Fastify({
        loggerInstance: logger,
        childLoggerFactory: createProbeRouteChildLoggerFactory(['/health']),
    });

    server.get('/health', (request, reply) => {
        request.log.info('checked');
        reply.send('ok');
    });
    server.get('/work', (_request, reply) => reply.send('ok'));

    await server.inject({ url });
    await server.close();

    return lines
        .map((line) => JSON.parse(line) as { msg: string; probe?: boolean; reqId?: string })
        .filter(({ reqId }) => reqId !== undefined);
}

describe('createProbeRouteChildLoggerFactory', () => {
    it('prefixes and marks every request log line of a probe path, also with a query', async () => {
        const logs = await getRequestLogs('/health?probe=1');

        expect(logs.map(({ msg }) => msg)).toEqual([
            '[probe] incoming request',
            '[probe] checked',
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
});
