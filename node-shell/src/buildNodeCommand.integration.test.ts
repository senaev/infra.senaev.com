import { execFileSync } from 'node:child_process';

import {
    describe, expect, it,
} from 'vitest';

import { buildNodeCommand } from './buildNodeCommand';
import { parseNodeHosts } from './nodeHosts';

const hosts = parseNodeHosts('hetzner', '{"senaev-madrid":"root@senaev-madrid"}');

// What the login shell on the remote host does with the one string that ssh sends: split it into
// arguments. Each argument is printed with a NUL after it, so newlines inside stay visible.
function argumentsSeenByRemoteShell(remoteCommand: string): string[] {
    const output = execFileSync('/bin/sh', [
        '-c',
        `printf '%s\\0' ${remoteCommand}`,
    ], { encoding: 'utf8' });

    return output.split('\0').slice(0, -1);
}

describe('buildNodeCommand through a real shell', () => {
    it('gives the remote host the same systemd-run argv as the local host gets', () => {
        const command = 'echo "$HOME" \'quoted\' `id` $(hostname); printf "a\\nb" | wc -l # end';
        const nodeCommand = {
            executionId: 'e1',
            command,
            timeoutSeconds: 5,
        };
        const local = buildNodeCommand(hosts, {
            ...nodeCommand,
            host: 'hetzner',
        });
        const remote = buildNodeCommand(hosts, {
            ...nodeCommand,
            host: 'senaev-madrid',
        });
        const remoteCommand = remote.at(-1) ?? '';

        expect(argumentsSeenByRemoteShell(remoteCommand)).toEqual(local.slice(5));
        expect(argumentsSeenByRemoteShell(remoteCommand).at(-1)).toBe(command);
    });
});
