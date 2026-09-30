import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { TG_TOKEN_SENAEV_COM_BOT, TRICKY_DAD_CHAT_ID } from '../env';
import { getMilestones } from '../obsidianSyncApi';

import { formatDailyOverview } from './formatDailyOverview';

/** Posts the milestones of `date` (default: today) and of the next day to the Tricky Dad chat. */
export async function sendDailyOverview(date?: string): Promise<{ messageId: number; text: string }> {
    const text = formatDailyOverview(await getMilestones(date));

    const { message_id: messageId } = await sendTelegramMessage({
        token: TG_TOKEN_SENAEV_COM_BOT,
        chatId: TRICKY_DAD_CHAT_ID,
        parseMode: 'HTML',
        disableLinkPreview: true,
        text,
    });

    return {
        messageId,
        text,
    };
}
