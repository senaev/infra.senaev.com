import { execFileSync, spawnSync } from 'node:child_process';
import {
    mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    describe, expect, it,
} from 'vitest';

import {
    buildNodeCommand, escapeForSystemd, guardCommand,
} from './buildNodeCommand';

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
        const local = buildNodeCommand({ kind: 'local' }, {
            ...nodeCommand,
            host: 'hetzner',
        });
        const remote = buildNodeCommand({
            kind: 'ssh',
            destination: 'root@senaev-madrid',
        }, {
            ...nodeCommand,
            host: 'senaev-madrid',
        });
        const remoteCommand = remote.at(-1) ?? '';

        expect(argumentsSeenByRemoteShell(remoteCommand)).toEqual(local.slice(7));
        expect(argumentsSeenByRemoteShell(remoteCommand).at(-1)).toBe(escapeForSystemd(command));
    });
});

describe('guardCommand in a real shell', () => {
    it('runs the command without a stop marker, and exits 143 without running it after a stop', () => {
        const directory = mkdtempSync(join(tmpdir(), 'node-shell guard-'));
        const marker = join(directory, 'e1.stop');
        const run = () => spawnSync('/bin/sh', [
            '-c',
            guardCommand(marker),
            'printf ran; exit 7',
        ], { encoding: 'utf8' });

        try {
            expect(run()).toMatchObject({
                status: 7,
                stdout: 'ran',
            });

            writeFileSync(marker, '');

            expect(run()).toMatchObject({
                status: 143,
                stdout: '',
            });
        } finally {
            rmSync(directory, {
                recursive: true,
                force: true,
            });
        }
    });
});
