import {
    describe, expect, it,
} from 'vitest';

import { isKnownHost, parseNodeHosts } from './nodeHosts';

describe('parseNodeHosts', () => {
    it('reads the local host and the SSH destinations', () => {
        const hosts = parseNodeHosts('hetzner', '{"senaev-madrid":"root@senaev-madrid"}');

        expect(hosts.localHost).toBe('hetzner');
        expect([...hosts.sshDestinations]).toEqual([
            [
                'senaev-madrid',
                'root@senaev-madrid',
            ],
        ]);
        expect(isKnownHost(hosts, 'hetzner')).toBe(true);
        expect(isKnownHost(hosts, 'senaev-madrid')).toBe(true);
        expect(isKnownHost(hosts, 'galkin')).toBe(false);
    });

    it.each([
        [
            'an option',
            '{"a":"-oProxyCommand=id"}',
        ],
        [
            'no user',
            '{"a":"senaev-madrid"}',
        ],
        [
            'a space',
            '{"a":"root@a b"}',
        ],
        [
            'not a string',
            '{"a":1}',
        ],
        [
            'not an object',
            '["root@a"]',
        ],
    ])('refuses a destination with %s', (_case, json) => {
        expect(() => parseNodeHosts('hetzner', json)).toThrow();
    });

    it('refuses an SSH destination for the local host', () => {
        expect(() => parseNodeHosts('hetzner', '{"hetzner":"root@hetzner"}')).toThrow();
    });
});
