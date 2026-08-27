import { trySendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/trySendTelegramMessage';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { TG_CLUSTER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from '../env';
import { logger } from '../logger';

/**
 * Logs a sync failure and mirrors it to the cluster chat.
 *
 * Never throws: a broken alert channel must not take down the watcher, and these are
 * called from event handlers where there is nobody left to catch.
 */
export async function reportSyncError(context: string, error: unknown): Promise<void> {
    logger.error({
        err: error,
        context,
    }, '❌ Telegram post sync failed');

    const result = await trySendTelegramMessage({
        text: `❌ obsidian-sync\n${context}\n${stringifyUnknownError(error)}`,
        chatId: TG_CLUSTER_CHAT_ID,
        token: TG_TOKEN_SENAEV_COM_BOT,
        disableLinkPreview: true,
    });

    if (!result.sent) {
        logger.error({ err: result.error }, '❌ Failed to send the failure alert itself');
    }
}
