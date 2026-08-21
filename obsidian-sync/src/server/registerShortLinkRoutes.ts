import { isObject } from 'senaev-utils/src/utils/Object/isObject';

import { logger } from '../logger';
import { createShortLink, getShortLinkUrl } from '../short-links/shortLinksStore';

import type { VaultServer } from './createVaultServer';

const MAX_URL_LENGTH = 8192;

export function registerShortLinkRoutes(server: VaultServer): void {
    server.post<{ Body: unknown }>('/short_links', async (request, reply) => {
        const { body } = request;

        if (!isObject(body)) {
            return reply
                .code(400)
                .send({
                    status: 'error',
                    message: 'Request body must be a JSON object',
                });
        }

        const { link } = body;

        if (typeof link !== 'string' || link.trim() === '') {
            return reply.code(400).send({
                status: 'error',
                message: 'Field "link" is required and must be a non-empty string',
            });
        }

        const trimmedLink = link.trim();

        if (trimmedLink.length > MAX_URL_LENGTH) {
            return reply.code(400).send({
                status: 'error',
                message: `Field "link" must not exceed ${MAX_URL_LENGTH} characters`,
            });
        }

        if (!URL.canParse(trimmedLink)) {
            return reply
                .code(400)
                .send({
                    status: 'error',
                    message: 'Field "link" must be a valid URL',
                });
        }

        let id: string;

        try {
            id = await createShortLink(trimmedLink);
        } catch (error) {
            logger.error(error, '❌ Failed to write short link to vault');

            return reply.code(500).send({
                status: 'error',
                message: 'Internal Server Error',
            });
        }

        logger.info({
            id,
            link: trimmedLink,
        }, '✅ Short link added');

        return reply.code(201).send({
            status: 'ok',
            id,
        });
    });

    server.get<{ Params: { id: string } }>('/short_links/:id', async (request, reply) => {
        const id = request.params.id.trim();

        if (!id) {
            return reply.code(400).send({
                status: 'error',
                message: 'Missing short link id',
            });
        }

        let url: string | null;

        try {
            url = await getShortLinkUrl(id);
        } catch (error) {
            logger.error(error, '❌ Failed to read short_links file');

            return reply.code(500).send({
                status: 'error',
                message: 'Internal Server Error',
            });
        }

        if (url === null) {
            return reply.code(404).send({
                status: 'error',
                message: 'Short link not found',
            });
        }

        return reply.code(200).send({
            status: 'ok',
            url,
        });
    });
}
