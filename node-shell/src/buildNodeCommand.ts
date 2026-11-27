import { type HostTarget, NODE_LIST_JSONPATH } from './nodeHosts';
import { shellQuote } from './shellQuote';

/**
 * Enters every namespace of the host's PID 1, and takes its root directory and working
 * directory, so the rest runs as the host's root, with the host's binaries, `/etc/passwd`,
 * `/root/.ssh` and `known_hosts`. Joining the mount namespace already resets both, but saying it
 * keeps the command right without that detail.
 */
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
/**
 * systemd expands `$NAME` and `${NAME}` in the command line of a unit before `/bin/sh` gets it, so
 * the shell's own variables would vanish. `$$` is systemd's escape for one `$`, on every version
 * (`--expand-environment=no` needs systemd 254).
 */
export function escapeForSystemd(command: string): string {
    return command.replaceAll('$', '$$$$');
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
        '--',
        '/bin/sh',
        '-c',
        escapeForSystemd(command),
    ];
}

/**
 * The argv to spawn in the node-shell container. The command of the local host runs there
 * directly; any other host gets it through ssh, which sends one string that the remote shell
 * parses again, so every argument is quoted.
 */
export function buildNodeCommand(target: HostTarget, nodeCommand: NodeCommand): string[] {
    const systemdRun = buildSystemdRun(nodeCommand);

    if (target.kind === 'local') {
        return [
            ...ENTER_HOST,
            ...systemdRun,
        ];
    }

    return [
        ...ENTER_HOST,
        'ssh',
        ...SSH_OPTIONS,
        target.destination,
        '--',
        systemdRun.map(shellQuote).join(' '),
    ];
}

/**
 * Lists the `vps` labels of the cluster nodes with the kubectl of k3s on the local host, the
 * control plane, as its root: node-shell needs no service account and no Kubernetes RBAC.
 */
export const LIST_NODES_ARGV: readonly string[] = [
    ...ENTER_HOST,
    'k3s',
    'kubectl',
    'get',
    'nodes',
    '--output',
    NODE_LIST_JSONPATH,
];
