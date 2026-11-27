import type { HostTarget } from './nodeHosts';
import { shellQuote } from './shellQuote';

// Run as the host's root, with its binaries, /root/.ssh and known_hosts.
export const ENTER_HOST = [
    'nsenter',
    '--target',
    '1',
    '--all',
    '--root',
    '--wd',
    '--',
];

export const SSH_CONNECT_TIMEOUT_SECONDS = 10;
// SIGKILL this long after SIGTERM (systemd's default is 90 s).
export const UNIT_STOP_TIMEOUT_SECONDS = 15;

// The host key must already be in the host's known_hosts.
const SSH_OPTIONS = [
    '-n',
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS}`,
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=2',
];

export type NodeCommand = {
    executionId: string;
    host: string;
    command: string;
    timeoutSeconds: number;
};

export function systemdUnitName(executionId: string): string {
    return `node-shell-${executionId}`;
}

// systemd stops the unit's whole cgroup at RuntimeMaxSec; closing ssh alone would not.
// systemd expands `$` in a unit's command line; `$$` is its escape (`--expand-environment=no` needs systemd 254).
export function escapeForSystemd(command: string): string {
    return command.replaceAll('$', '$$$$');
}

// On the host's tmpfs, so a reboot removes it. A stop creates it before `systemctl stop`.
export function stopMarkerPath(executionId: string): string {
    return `/run/node-shell-${executionId}.stop`;
}

// Runs in the unit: a stop that came before the unit existed finds no unit, so the unit checks.
export function guardCommand(markerPath: string): string {
    return `if [ -e ${shellQuote(markerPath)} ]; then exit 143; fi; exec /bin/sh -c "$0"`;
}

function buildSystemdRun({
    executionId, command, timeoutSeconds,
}: NodeCommand): string[] {
    return [
        'systemd-run',
        `--unit=${systemdUnitName(executionId)}`,
        // Without it the description is the command itself, and systemd writes it to the journal.
        `--description=node-shell ${executionId}`,
        '--wait',
        '--pipe',
        '--collect',
        '--quiet',
        '--service-type=exec',
        `--property=RuntimeMaxSec=${timeoutSeconds}`,
        `--property=TimeoutStopSec=${UNIT_STOP_TIMEOUT_SECONDS}`,
        '--',
        '/bin/sh',
        '-c',
        escapeForSystemd(guardCommand(stopMarkerPath(executionId))),
        escapeForSystemd(command),
    ];
}

// ssh joins its arguments into one string for the remote shell, so each one is quoted.
function onHost(target: HostTarget, argv: string[]): string[] {
    if (target.kind === 'local') {
        return [
            ...ENTER_HOST,
            ...argv,
        ];
    }

    return [
        ...ENTER_HOST,
        'ssh',
        ...SSH_OPTIONS,
        target.destination,
        '--',
        argv.map(shellQuote).join(' '),
    ];
}

export function buildNodeCommand(target: HostTarget, nodeCommand: NodeCommand): string[] {
    return onHost(target, buildSystemdRun(nodeCommand));
}

// The marker first: either the unit exists and systemctl stops it (waiting for SIGTERM, then
// SIGKILL after `TimeoutStopSec`), or the unit starts later and its guard exits.
export function buildStopCommand(target: HostTarget, executionId: string): string[] {
    return onHost(target, [
        '/bin/sh',
        '-c',
        `touch ${shellQuote(stopMarkerPath(executionId))} && systemctl stop ${systemdUnitName(executionId)}`,
    ]);
}
