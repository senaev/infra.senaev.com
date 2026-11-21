import { isObject } from 'senaev-utils/src/types/Object/Object';

import { prependRecommendationsRecord } from '../jobSearch/prependRecommendationsRecord';
import { logger } from '../logger';

import type { VaultServer } from './createVaultServer';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const MAX_TEXT_LENGTH = 100_000;

export function registerJobSearchRoutes(server: VaultServer): void {
    // n8n, through cluster-helper: the answer of a job search round, as posted to Telegram.
    server.post<{ Body: unknown }>('/job-search/recommendations', async (request, reply) => {
        const body = isObject(request.body) ? request.body : {};
        const {
            date, time, text,
        } = body;

        if (typeof date !== 'string' || !DATE_PATTERN.test(date) || typeof time !== 'string' || !TIME_PATTERN.test(time)) {
            return reply.code(400).type('text/plain').send('Fields "date" (YYYY-MM-DD) and "time" (HH:MM, UTC) are required');
        }

        if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_LENGTH) {
            return reply.code(400).type('text/plain').send(`Field "text" must be a non-empty string up to ${MAX_TEXT_LENGTH} characters`);
        }

        try {
            await prependRecommendationsRecord(`## [[${date}]] ${time} UTC`, text);
        } catch (error) {
            logger.error(error, '❌ Failed to add the job search recommendations');

            return reply.code(500).type('text/plain').send('Internal Server Error');
        }

        logger.info({
            date,
            time,
            textLength: text.length,
        }, '✅ Job search recommendations added');

        return reply.code(201).type('text/plain').send('Created');
    });
}
