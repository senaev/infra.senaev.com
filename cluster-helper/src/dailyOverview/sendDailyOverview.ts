import { createTelegramRichMessage } from 'senaev-utils/src/utils/TelegramApi/createTelegramRichMessage';

import { TG_TOKEN_SENAEV_COM_BOT, TRICKY_DAD_CHAT_ID } from '../env';
import { logger } from '../logger';
import { getMilestones } from '../obsidianSyncApi';

import { formatDailyOverview } from './formatDailyOverview';

/** Posts the milestones of `date` (default: today) and of the next day to the Tricky Dad chat. */
export async function sendDailyOverview(date?: string): Promise<{ messageId: number; text: string }> {
    const text = formatDailyOverview(await getMilestones(date));

    // A rich message, so that headings and lists render as real blocks.
    const messageId = await createTelegramRichMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: TRICKY_DAD_CHAT_ID,
        markdown: text,
        media: [],
        onRateLimited: (info) => {
            logger.warn(info, '⚠️ Daily overview rate-limited by Telegram');
        },
    });

    return {
        messageId,
        text,
    };
}
