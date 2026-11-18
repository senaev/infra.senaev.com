import Fastify from 'fastify';
import pino from 'pino';
import {
    describe, expect, it,
} from 'vitest';

import { createNoisyRouteChildLoggerFactory } from './noisyRouteLogging';

async function getRequestLogs(url: string): Promise<Array<{ msg: string; noise?: boolean }>> {
    const lines: string[] = [];
    const logger = pino({}, {
        write: (line: string) => {
            lines.push(line);
        },
    });
    const server = Fastify({
        loggerInstance: logger,
        childLoggerFactory: createNoisyRouteChildLoggerFactory(['/health']),
    });

    server.get('/health', (request, reply) => {
        request.log.info('checked');
        reply.send('ok');
    });
    server.get('/work', (_request, reply) => reply.send('ok'));

    await server.inject({ url });
    await server.close();

    return lines
        .map((line) => JSON.parse(line) as { msg: string; noise?: boolean; reqId?: string })
        .filter(({ reqId }) => reqId !== undefined);
}

describe('createNoisyRouteChildLoggerFactory', () => {
    it('prefixes and marks every request log line of a noisy path, also with a query', async () => {
        const logs = await getRequestLogs('/health?probe=1');

        expect(logs.map(({ msg }) => msg)).toEqual([
            '[noise] incoming request',
            '[noise] checked',
            '[noise] request completed',
        ]);
        expect(logs.every(({ noise }) => noise === true)).toBe(true);
    });

    it('leaves other paths unchanged', async () => {
        const logs = await getRequestLogs('/work');

        expect(logs.map(({ msg }) => msg)).toEqual([
            'incoming request',
            'request completed',
        ]);
        expect(logs.some(({ noise }) => noise !== undefined)).toBe(false);
    });
});
