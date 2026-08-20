import { callTelegramApi } from './callTelegramApi';
import { TelegramForwardPayload } from './types';

export function forwardTelegramApiCall({
    method,
    body,
    token,
}: TelegramForwardPayload): Promise<unknown> {
    return callTelegramApi({
        method,
        body,
        token,
    });
}
