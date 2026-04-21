import { callTelegramApi } from './callTelegramApi';
import { TelegramUser } from './types';

export function getCurrentTelegramBotInfo(token: string): Promise<TelegramUser> {
    return callTelegramApi<TelegramUser>({
        method: 'getMe',
        token,
    });
}
