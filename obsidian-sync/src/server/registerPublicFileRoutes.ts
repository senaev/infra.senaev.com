import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import type { FastifyReply } from 'fastify';

import { findFileRecursively } from '../public-files/findFileRecursively';
import {
    getMimeTypeByExtension,
    MARKDOWN_MIME_TYPE,
} from '../public-files/getMimeTypeByExtension';
import { logger } from '../logger';
import { PUBLIC_DIR } from '../vaultPaths';

import type { VaultServer } from './createVaultServer';

type PublicFileQuery = {
    note?: unknown;
    file?: unknown;
};

function badRequest(reply: FastifyReply, message: string): FastifyReply {
    return reply.code(400).type('text/plain').send(message);
}

/**
 * `?note=<name>` looks up `<name>.md` and always returns it as markdown, while
 * `?file=<name.ext>` requires an extension and picks the MIME type from it.
 *
 * `basename` strips any directory component, so a crafted `note`/`file` value
 * cannot escape PUBLIC_DIR.
 */
async function servePublicFile(
    query: PublicFileQuery,
    reply: FastifyReply
): Promise<FastifyReply> {
    const { note, file } = query;

    if (note !== undefined && file !== undefined) {
        return badRequest(reply, 'Use either "note" or "file" parameter, not both');
    }

    if (note !== undefined) {
        if (typeof note !== 'string' || note.trim() === '') {
            return badRequest(reply, 'Parameter "note" must not be empty');
        }

        const safeName = basename(note.trim());
        const fileName = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
        const filePath = findFileRecursively(PUBLIC_DIR, fileName);

        if (!filePath) {
            return reply.code(404).type('text/plain').send('Not found');
        }

        try {
            const content = await readFile(filePath, 'utf8');

            return reply.code(200).type(MARKDOWN_MIME_TYPE).send(content);
        } catch (error) {
            logger.error(error, '❌ Failed to read note from vault');

            return reply.code(500).type('text/plain').send('Internal Server Error');
        }
    }

    if (file !== undefined) {
        if (typeof file !== 'string' || file.trim() === '') {
            return badRequest(reply, 'Parameter "file" must not be empty');
        }

        const safeName = basename(file.trim());
        const extension = extname(safeName).toLowerCase();

        if (!extension) {
            return badRequest(reply, 'Parameter "file" must include a file extension');
        }

        const filePath = findFileRecursively(PUBLIC_DIR, safeName);

        if (!filePath) {
            return reply.code(404).type('text/plain').send('Not found');
        }

        try {
            const content = await readFile(filePath);

            return reply.code(200).type(getMimeTypeByExtension(extension)).send(content);
        } catch (error) {
            logger.error(error, '❌ Failed to read file from vault');

            return reply.code(500).type('text/plain').send('Internal Server Error');
        }
    }

    return badRequest(reply, 'Missing required query parameter: "note" or "file"');
}

export function registerPublicFileRoutes(server: VaultServer): void {
    // Registered on both the root and a catch-all so any GET path with a
    // `note`/`file` query serves the vault file, matching the behaviour clients
    // (notably the senaev.com Next.js app) already rely on. The more specific
    // routes registered elsewhere still win over this wildcard.
    const handler = (
        request: { query: PublicFileQuery },
        reply: FastifyReply
    ): Promise<FastifyReply> => servePublicFile(request.query, reply);

    server.get<{ Querystring: PublicFileQuery }>('/', handler);
    server.get<{ Querystring: PublicFileQuery }>('/*', handler);
}
