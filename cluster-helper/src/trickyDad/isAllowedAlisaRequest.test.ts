import {
    describe, expect, it,
} from 'vitest';

import {
    ALISA_SKILL_ID, isAllowedAlisaRequest, parseAlisaAllowedUserIds,
} from './isAllowedAlisaRequest';

const allowedUserIds = new Set(['allowed-user']);

function buildBody(session: unknown): unknown {
    return {
        request: { command: 'купи хлеб' },
        session,
        version: '1.0',
    };
}

describe('isAllowedAlisaRequest', () => {
    it('allows our skill and an allowed user', () => {
        const body = buildBody({
            skill_id: ALISA_SKILL_ID,
            user: { user_id: 'allowed-user' },
        });

        expect(isAllowedAlisaRequest(body, allowedUserIds)).toBe(true);
    });

    it.each([
        [
            'no body',
            undefined,
        ],
        [
            'no session',
            { request: { command: 'x' } },
        ],
        [
            'another skill',
            buildBody({
                skill_id: 'another-skill',
                user: { user_id: 'allowed-user' },
            }),
        ],
        [
            'another user',
            buildBody({
                skill_id: ALISA_SKILL_ID,
                user: { user_id: 'another-user' },
            }),
        ],
        [
            'a user who is not logged in',
            buildBody({ skill_id: ALISA_SKILL_ID }),
        ],
        [
            'the application ID in place of the user ID',
            buildBody({
                skill_id: ALISA_SKILL_ID,
                user_id: 'allowed-user',
                application: { application_id: 'allowed-user' },
            }),
        ],
        [
            'a user ID that is not a string',
            buildBody({
                skill_id: ALISA_SKILL_ID,
                user: { user_id: ['allowed-user'] },
            }),
        ],
    ])('rejects %s', (_case, body) => {
        expect(isAllowedAlisaRequest(body, allowedUserIds)).toBe(false);
    });
});

describe('parseAlisaAllowedUserIds', () => {
    it('trims the entries and skips empty ones', () => {
        expect(parseAlisaAllowedUserIds(' a , b,,')).toEqual(new Set([
            'a',
            'b',
        ]));
    });

    it.each([
        '',
        ' , ',
    ])('throws on an empty list [%s]', (value) => {
        expect(() => parseAlisaAllowedUserIds(value)).toThrow(/ALISA_ALLOWED_USER_IDS/);
    });
});
