import { sendTelegramMessage } from 'senaev-utils/src/utils/TelegramApi/sendTelegramMessage';

import { TG_MEDIA_SERVER_CHAT_ID, TG_TOKEN_SENAEV_COM_BOT } from './env';

export async function sendTelegramHtmlMessage(html: string): Promise<void> {
    await sendTelegramMessage({
        text: html,
        chatId: TG_MEDIA_SERVER_CHAT_ID,
        token: TG_TOKEN_SENAEV_COM_BOT,
        parseMode: 'HTML',
    });
}
