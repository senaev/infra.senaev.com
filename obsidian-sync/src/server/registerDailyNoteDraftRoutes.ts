import { isObject } from 'senaev-utils/src/types/Object/Object';

import { appendDailyNoteDraftRecord } from '../daily-note-draft/appendDailyNoteDraftRecord';
import { logger } from '../logger';
import { DAILY_NOTE_DRAFT_VAULT_RELATIVE_PATH } from '../vaultPaths';

import type { VaultServer } from './createVaultServer';

export function registerDailyNoteDraftRoutes(server: VaultServer): void {
    server.post<{ Body: unknown }>('/daily-note-draft', async (request, reply) => {
        const { body } = request;

        if (!isObject(body) || typeof body.text !== 'string' || body.text.trim() === '') {
            return reply.code(400).type('text/plain')
                .send('Request body must be a JSON object with a non-empty string field "text"');
        }

        try {
            await appendDailyNoteDraftRecord(body.text.trim());
        } catch (error) {
            logger.error(error, '❌ Failed to append daily note draft record');

            return reply.code(500).type('text/plain').send('Internal Server Error');
        }

        logger.info({ length: body.text.length }, '✅ Daily note draft record appended');

        return reply.code(201).send({ path: DAILY_NOTE_DRAFT_VAULT_RELATIVE_PATH });
    });
}
