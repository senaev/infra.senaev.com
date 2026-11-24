import type { FastifyInstance } from 'fastify';
import { isObject } from 'senaev-utils/src/types/Object/Object';

import { prependRecommendationsRecord } from '../jobSearch/prependRecommendationsRecord';
import { logger } from '../logger';

const MAX_TEXT_LENGTH = 100_000;

/** A real calendar day, e.g. not `2026-02-30`. */
function isValidDate(date: unknown): date is string {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

/** `HH:MM` from `00:00` to `23:59`. */
function isValidTime(time: unknown): time is string {
    return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

export function registerJobSearchRoutes(server: Pick<FastifyInstance, 'post'>): void {
    // cluster-helper's /job-search/round-report: the answer of a job search round, as posted to Telegram.
    server.post<{ Body: unknown }>('/job-search/recommendations', async (request, reply) => {
        const body = isObject(request.body) ? request.body : {};
        const {
            date, time, text,
        } = body;

        if (!isValidDate(date) || !isValidTime(time)) {
            return reply.code(400).type('text/plain').send('Fields "date" (YYYY-MM-DD) and "time" (HH:MM, UTC) are required');
        }

        if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_TEXT_LENGTH) {
            return reply.code(400).type('text/plain').send(`Field "text" must be a non-empty string up to ${MAX_TEXT_LENGTH} characters`);
        }

        let added: boolean;

        try {
            added = await prependRecommendationsRecord(`## [[${date}]] ${time} UTC`, text);
        } catch (error) {
            logger.error(error, '❌ Failed to add the job search recommendations');

            return reply.code(500).type('text/plain').send('Internal Server Error');
        }

        logger.info({
            date,
            time,
            textLength: text.length,
        }, added ? '✅ Job search recommendations added' : '🔁 Job search recommendations were already there');

        return added
            ? reply.code(201).type('text/plain').send('Created')
            : reply.code(200).type('text/plain').send('Already there');
    });
}
