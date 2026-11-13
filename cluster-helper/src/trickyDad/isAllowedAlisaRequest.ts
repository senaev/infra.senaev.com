import { isObject } from 'senaev-utils/src/types/Object/Object';

/** Not a secret: the ID of the "Умный Папа" skill in the Yandex Dialogs console. */
export const ALISA_SKILL_ID = 'e456585c-55dc-435e-9294-5312dc94b497';

/** Parses a comma-separated list of Yandex user IDs; throws when the list is empty. */
export function parseAlisaAllowedUserIds(value: string): ReadonlySet<string> {
    const userIds = value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');

    if (userIds.length === 0) {
        throw new Error('ALISA_ALLOWED_USER_IDS: no user IDs');
    }

    return new Set(userIds);
}

/**
 * Yandex Dialogs cannot send a custom header or sign a request, so the webhook trusts a
 * request only by its body: our skill, and a Yandex user from the allowlist.
 * session.user.user_id is unique for each user and skill pair and is not public, but it is
 * also fixed: it must not get into the logs.
 */
export function isAllowedAlisaRequest(body: unknown, allowedUserIds: ReadonlySet<string>): boolean {
    if (!isObject(body) || !isObject(body.session)) {
        return false;
    }

    const { session } = body;

    if (session.skill_id !== ALISA_SKILL_ID || !isObject(session.user)) {
        return false;
    }

    const userId = session.user.user_id;

    return typeof userId === 'string' && allowedUserIds.has(userId);
}
