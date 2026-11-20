import {
    describe, expect, it,
} from 'vitest';

import { parseAuthority } from './proxy.ts';
import { parseRules } from './rules.ts';

describe('parseRules', () => {
    it('fills in environment variables', () => {
        const rules = parseRules(
            '{"api.github.com": {"authorization": "token ${GH_TOKEN}", "x-other": "${A}-${B}"}}',
            {
                GH_TOKEN: 'secret',
                A: 'a',
                B: 'b',
            }
        );

        expect(rules.get('api.github.com')).toEqual({
            authorization: 'token secret',
            'x-other': 'a-b',
        });
    });

    it('fails without the variable, and does not show other values', () => {
        expect(() => parseRules('{"api.github.com": {"authorization": "token ${GH_TOKEN}"}}', { OTHER: 'secret' }))
            .toThrow('api.github.com header authorization needs the environment variable GH_TOKEN');
    });

    it.each([
        [
            'an empty object',
            '{}',
        ],
        [
            'an array',
            '[]',
        ],
        [
            'an upper-case host',
            '{"API.github.com": {"authorization": "x"}}',
        ],
        [
            'a host with a port',
            '{"api.github.com:443": {"authorization": "x"}}',
        ],
        [
            'a host without headers',
            '{"api.github.com": {}}',
        ],
        [
            'an upper-case header',
            '{"api.github.com": {"Authorization": "x"}}',
        ],
        [
            'the host header',
            '{"api.github.com": {"host": "x"}}',
        ],
        [
            'a hop-by-hop header',
            '{"api.github.com": {"connection": "x"}}',
        ],
        [
            'a header value that is not a string',
            '{"api.github.com": {"authorization": 1}}',
        ],
    ])('rejects %s', (_case, json) => {
        expect(() => parseRules(json, {})).toThrow('MITM_RULES');
    });
});

describe('parseAuthority', () => {
    it.each([
        [
            'api.github.com:443',
            {
                host: 'api.github.com',
                port: 443,
            },
        ],
        [
            'API.GitHub.com:443',
            {
                host: 'api.github.com',
                port: 443,
            },
        ],
        [
            '[::1]:8443',
            {
                host: '::1',
                port: 8443,
            },
        ],
    ])('reads %s', (authority, expected) => {
        expect(parseAuthority(authority)).toEqual(expected);
    });

    it.each([
        'api.github.com',
        'api.github.com:0',
        'api.github.com:70000',
        'user@api.github.com:443',
        '/path',
    ])(
        'rejects %s',
        (authority) => {
            expect(parseAuthority(authority)).toBeUndefined();
        }
    );
});
