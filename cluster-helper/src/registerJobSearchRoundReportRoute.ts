import type {
    FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase,
} from 'fastify';
import { replaceWikiLinksWithHighlights } from 'senaev-utils/src/obsidianMarkdown/replaceWikiLinksWithHighlights';
import { isString } from 'senaev-utils/src/utils/String/isString';

import { logger } from './logger';

export type JobSearchRoundReport = {
    /** The start time of the round in UTC, `YYYY-MM-DD` and `HH:MM`: the heading of its log record. */
    date: string;
    time: string;
    /** The answer of the round: Telegram Rich Markdown with Obsidian `[[links]]`. */
    text: string;
};

export type JobSearchRoundReportTargets = {
    /** Posts the message to the Job Search Framework chat. */
    sendTelegramMessage: (text: string) => Promise<unknown>;
    /** Adds the record to the LLM Recommendations Log. */
    addToRecommendationsLog: (report: JobSearchRoundReport) => Promise<void>;
};

function isJobSearchRoundReport(body: unknown): body is JobSearchRoundReport {
    const {
        date, time, text,
    } = (body ?? {}) as Record<string, unknown>;

    return isString(date) && isString(time) && isString(text);
}

/**
 * The one call of the n8n `job-search-round` workflow after a round: posts the answer to Telegram,
 * with the Obsidian links turned into highlights, and adds it, links unchanged, to the LLM
 * Recommendations Log. Both run at once and neither waits for the other, so a failed log write
 * cannot stop the message. Nothing is retried: a second message would be a duplicate.
 */
export function registerJobSearchRoundReportRoute<RawServer extends RawServerBase, Logger extends FastifyBaseLogger>(
    server: Pick<FastifyInstance<RawServer, RawRequestDefaultExpression<RawServer>, RawReplyDefaultExpression<RawServer>, Logger>, 'post'>,
    targets: JobSearchRoundReportTargets
): void {
    server.post<{ Body: unknown }>('/job-search/round-report', async (request, reply) => {
        const report = request.body;

        if (!isJobSearchRoundReport(report)) {
            return reply.code(400).send({
                status: 'error',
                message: 'The body must be { "date": "YYYY-MM-DD", "time": "HH:MM", "text": "..." }',
            });
        }

        logger.info({
            date: report.date,
            time: report.time,
            textLength: report.text.length,
        }, '🆕 Received a job search round report');

        // Each delivery starts in its own async function, so even a synchronous throw, e.g. in the
        // link conversion, fails only that delivery.
        const deliveries = [
            {
                target: 'Telegram',
                deliver: async () => {
                    await targets.sendTelegramMessage(replaceWikiLinksWithHighlights(report.text));
                },
            },
            {
                target: 'LLM Recommendations Log',
                deliver: async () => {
                    await targets.addToRecommendationsLog(report);
                },
            },
        ];
        const results = await Promise.allSettled(deliveries.map(({ deliver }) => deliver()));
        const failures: string[] = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                return;
            }

            const target = deliveries[index]?.target;
            const { reason }: { reason: unknown } = result;

            logger.error({
                err: reason,
                target,
            }, '❌ Failed to deliver a job search round report');
            failures.push(`${target}: ${reason instanceof Error ? reason.message : String(reason)}`);
        });

        if (failures.length > 0) {
            return reply.code(502).send({
                status: 'error',
                message: failures.join('; '),
            });
        }

        logger.info({
            date: report.date,
            time: report.time,
        }, '✅ Job search round report delivered');

        return reply.code(200).send({ status: 'ok' });
    });
}
