import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

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

    try {
        await sendTelegramMessage({
            text: `❌ obsidian-sync\n${context}\n${stringifyUnknownError(error)}`,
            chatId: TG_CLUSTER_CHAT_ID,
            token: TG_TOKEN_SENAEV_COM_BOT,
            disableLinkPreview: true,
        });
    } catch (alertError) {
        logger.error({ err: alertError }, '❌ Failed to send the failure alert itself');
    }
}
