import type { FastifyInstance } from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';
import { registerMtlsCallerAllowlist } from 'senaev-utils/src/utils/mtls/registerMtlsCallerAllowlist';

import { ALLOWED_CALLERS } from './callers';
import { logger } from './logger';

type TorrentFileRequestBody = {
    fileName: string;
    contentBase64: string;
};

function isTorrentFileRequestBody(value: unknown): value is TorrentFileRequestBody {
    return (
        isObject(value) && typeof value.fileName === 'string' && typeof value.contentBase64 === 'string'
    );
}

function badRequest(message: string): Error & { statusCode: number } {
    return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Writes the received torrent files to the disk, so only for the mTLS instance: only the services
 * in `ALLOWED_CALLERS` may call any route.
 */
export function registerTorrentFileRoutes(
    server: Pick<FastifyInstance, 'addHook' | 'post'>,
    writeFile: (buffer: Buffer, fileName: string) => string
): void {
    // First, so the check covers every route registered below. The caller is already
    // authenticated by `createMtlsFastifyServer`.
    registerMtlsCallerAllowlist(server, ALLOWED_CALLERS);

    server.post<{ Body: unknown }>('/torrent-files', (request, reply) => {
        if (!isTorrentFileRequestBody(request.body)) {
            logger.error({ bodyType: typeof request.body }, '❌ Invalid torrent file request body');
            throw badRequest('Invalid torrent file request body');
        }

        const buffer = Buffer.from(request.body.contentBase64, 'base64');

        if (buffer.length === 0) {
            logger.error({ fileName: request.body.fileName }, '❌ Received empty torrent file');
            throw badRequest('Empty torrent file');
        }

        const path = writeFile(buffer, request.body.fileName);

        logger.info({ path }, '✅ Wrote torrent file from HTTP request');

        return reply.send('OK');
    });
}
