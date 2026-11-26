import {
    describe, expect, it,
} from 'vitest';

import { buildNodeCommand, escapeForSystemd } from './buildNodeCommand';
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
            '--root',
            '--wd',
            '--',
            'systemd-run',
            '--unit=node-shell-abc-123',
            '--description=node-shell abc-123',
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

        expect(argv.slice(0, 8)).toEqual([
            'nsenter',
            '--target',
            '1',
            '--all',
            '--root',
            '--wd',
            '--',
            'ssh',
        ]);
        expect(argv).toContain('BatchMode=yes');
        expect(argv).toContain('StrictHostKeyChecking=yes');
        expect(argv.slice(-3)).toEqual([
            'root@senaev-madrid',
            '--',
            '\'systemd-run\' \'--unit=node-shell-abc-123\' \'--description=node-shell abc-123\' \'--wait\' \'--pipe\' \'--collect\' \'--quiet\' ' + '\'--service-type=exec\' \'--property=RuntimeMaxSec=30\' \'--\' \'/bin/sh\' \'-c\' ' + '\'echo \'\\\'\'hi\'\\\'\' && id\'',
        ]);
    });

    it('keeps the command out of the unit description', () => {
        const argv = buildNodeCommand(hosts, {
            ...command,
            host: 'hetzner',
            command: 'curl -H "Authorization: secret-token" https://example.com',
        });

        expect(argv.filter((argument) => argument.startsWith('--description='))).toEqual(['--description=node-shell abc-123']);
    });

    it('escapes every $ for systemd, so the shell gets its own variables', () => {
        expect(escapeForSystemd('v=ok; echo "${v}" $HOME $$')).toBe('v=ok; echo "$${v}" $$HOME $$$$');
        expect(buildNodeCommand(hosts, {
            ...command,
            host: 'hetzner',
            command: 'echo $HOME',
        }).at(-1)).toBe('echo $$HOME');
    });

    it('refuses an unknown host', () => {
        expect(() => buildNodeCommand(hosts, {
            ...command,
            host: 'galkin',
        })).toThrow('Unknown host: galkin');
    });
});
