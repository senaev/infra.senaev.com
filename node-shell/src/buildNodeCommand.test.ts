import {
    describe, expect, it,
} from 'vitest';

import { buildNodeCommand } from './buildNodeCommand';
import { parseNodeHosts } from './nodeHosts';

const hosts = parseNodeHosts('hetzner', '{"senaev-madrid":"root@senaev-madrid"}');
const command = {
    executionId: 'abc-123',
    command: 'echo \'hi\' && id',
    timeoutSeconds: 30,
};

describe('buildNodeCommand', () => {
    it('runs the command of the local host in the host, in a systemd unit', () => {
        expect(buildNodeCommand(hosts, {
            ...command,
            host: 'hetzner',
        })).toEqual([
            'nsenter',
            '--target',
            '1',
            '--all',
            '--',
            'systemd-run',
            '--unit=node-shell-abc-123',
            '--wait',
            '--pipe',
            '--collect',
            '--quiet',
            '--service-type=exec',
            '--property=RuntimeMaxSec=30',
            '--',
            '/bin/sh',
            '-c',
            'echo \'hi\' && id',
        ]);
    });

    it('sends the command of another host through ssh from the host, quoted for the remote shell', () => {
        const argv = buildNodeCommand(hosts, {
            ...command,
            host: 'senaev-madrid',
        });

        expect(argv.slice(0, 6)).toEqual([
            'nsenter',
            '--target',
            '1',
            '--all',
            '--',
            'ssh',
        ]);
        expect(argv).toContain('BatchMode=yes');
        expect(argv).toContain('StrictHostKeyChecking=yes');
        expect(argv.slice(-3)).toEqual([
            'root@senaev-madrid',
            '--',
            '\'systemd-run\' \'--unit=node-shell-abc-123\' \'--wait\' \'--pipe\' \'--collect\' \'--quiet\' ' + '\'--service-type=exec\' \'--property=RuntimeMaxSec=30\' \'--\' \'/bin/sh\' \'-c\' ' + '\'echo \'\\\'\'hi\'\\\'\' && id\'',
        ]);
    });

    it('refuses an unknown host', () => {
        expect(() => buildNodeCommand(hosts, {
            ...command,
            host: 'galkin',
        })).toThrow('Unknown host: galkin');
    });
});
