import type { NodeHosts } from './nodeHosts';
import { shellQuote } from './shellQuote';

/** Enters every namespace of the host's PID 1, so the rest runs as the host's root. */
const ENTER_HOST = [
    'nsenter',
    '--target',
    '1',
    '--all',
    '--',
];

export const SSH_CONNECT_TIMEOUT_SECONDS = 10;

// No prompt of any kind (a password, an unknown host key), and a dead connection is noticed.
// The host key must already be in the host's known_hosts: a changed key fails the command.
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

/**
 * Runs the command in a transient systemd unit on the target host. At `RuntimeMaxSec` systemd
 * stops the whole cgroup of the unit, also the processes that left the process group: closing
 * an SSH session alone would not kill them. The unit name follows the execution ID, so systemd
 * refuses a second unit for the same execution while the first one runs.
 */
function buildSystemdRun({
    executionId, command, timeoutSeconds,
}: NodeCommand): string[] {
    return [
        'systemd-run',
        `--unit=${systemdUnitName(executionId)}`,
        '--wait',
        '--pipe',
        '--collect',
        '--quiet',
        '--service-type=exec',
        `--property=RuntimeMaxSec=${timeoutSeconds}`,
        '--',
        '/bin/sh',
        '-c',
        command,
    ];
}

/**
 * The argv to spawn in the node-shell container. The command of the local host runs there
 * directly; any other host gets it through ssh, which sends one string that the remote shell
 * parses again, so every argument is quoted.
 */
export function buildNodeCommand(hosts: NodeHosts, nodeCommand: NodeCommand): string[] {
    const systemdRun = buildSystemdRun(nodeCommand);

    if (nodeCommand.host === hosts.localHost) {
        return [
            ...ENTER_HOST,
            ...systemdRun,
        ];
    }

    const destination = hosts.sshDestinations.get(nodeCommand.host);

    if (destination === undefined) {
        throw new Error(`Unknown host: ${nodeCommand.host}`);
    }

    return [
        ...ENTER_HOST,
        'ssh',
        ...SSH_OPTIONS,
        destination,
        '--',
        systemdRun.map(shellQuote).join(' '),
    ];
}
