import { logger } from '../logger';
import { parseIsoCalendarDay, todayInTimeZone } from '../milestones/calendarDay';
import { getMilestones } from '../milestones/getMilestones';

import type { VaultServer } from './createVaultServer';

/** The day that `GET /milestones` uses when the request gives no `date`. */
const DEFAULT_TIME_ZONE = 'Europe/Madrid';

export function registerMilestoneRoutes(server: VaultServer): void {
    server.get<{ Querystring: { date?: string } }>('/milestones', async (request, reply) => {
        const { date } = request.query;
        const today = date === undefined ? todayInTimeZone(DEFAULT_TIME_ZONE) : parseIsoCalendarDay(date);

        if (today === null) {
            return reply.code(400).send({
                status: 'error',
                message: 'Query parameter "date" must be a real day in YYYY-MM-DD format',
            });
        }

        try {
            return reply.code(200).send({
                status: 'ok',
                ...await getMilestones(today),
            });
        } catch (error) {
            logger.error(error, '❌ Failed to collect milestones');

            return reply.code(500).send({
                status: 'error',
                message: 'Internal Server Error',
            });
        }
    });
}
