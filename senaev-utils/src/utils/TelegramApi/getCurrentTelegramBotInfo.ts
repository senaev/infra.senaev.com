import { assertBoolean } from '../../types/Boolean';
import { assertInteger } from '../../types/Number/Integer';
import { assertObject } from '../../types/Object/Object';
import { assertNonEmptyString } from '../String/NonEmptyString/NonEmptyString';

import { callTelegramApi } from './callTelegramApi';
import { TelegramUser } from './types';

export async function getCurrentTelegramBotInfo(token: string): Promise<TelegramUser> {
    const response = await callTelegramApi<unknown>({
        method: 'getMe',
        token,
    });

    assertObject(response);

    const {
        id,
        is_bot,
        first_name,
        username,
    } = response;

    assertInteger(id);
    assertBoolean(is_bot);
    assertNonEmptyString(first_name);
    assertNonEmptyString(username);

    return {
        id,
        is_bot,
        first_name,
        username,
    };
}
