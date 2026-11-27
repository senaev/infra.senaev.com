import { ENTER_HOST } from './buildNodeCommand';
import { NODE_SHELL_LOCAL_HOST } from './env';
import { logger } from './logger';
import { runCommand } from './runCommand';

export type HostTarget = { kind: 'local' } | { kind: 'ssh'; destination: string };

// A `vps` label, which is also the host's tailnet name: nothing that ssh could read as an option.
const HOST_NAME = /^[a-z0-9][a-z0-9-]*$/;

const LIST_NODES_DEADLINE_MS = 30_000;
const LIST_NODES_MAX_OUTPUT_BYTES = 64 * 1024;

// As the host's root: node-shell needs no service account.
export const LIST_NODES_ARGV: readonly string[] = [
    ...ENTER_HOST,
    'k3s',
    'kubectl',
    'get',
    'nodes',
    '--output',
    'jsonpath={range .items[*]}{.metadata.labels.vps}{"\\n"}{end}',
];

async function listClusterNodes(): Promise<string[]> {
    const result = await runCommand({
        argv: LIST_NODES_ARGV,
        deadlineMs: LIST_NODES_DEADLINE_MS,
        maxOutputBytes: LIST_NODES_MAX_OUTPUT_BYTES,
    });

    if (result.exitCode !== 0) {
        throw new Error(`kubectl get nodes failed with exit code ${String(result.exitCode)}: ${result.stderr.trim()}`);
    }

    const nodes = result.stdout.split('\n').map((line) => line.trim()).filter((name) => HOST_NAME.test(name));

    logger.info({ nodes }, '🗂️ Read the cluster nodes');

    return nodes;
}

/** The target of a host that was already checked, as in a saved execution. */
export function hostTarget(host: string): HostTarget {
    return host === NODE_SHELL_LOCAL_HOST
        ? { kind: 'local' }
        : {
            kind: 'ssh',
            // root: the commands run in system units of systemd.
            destination: `root@${host}`,
        };
}

/** `undefined` for a host that is not a cluster node; rejects when the node list cannot be read. */
export async function resolveHost(host: string): Promise<HostTarget | undefined> {
    if (!HOST_NAME.test(host)) {
        return undefined;
    }

    if (host === NODE_SHELL_LOCAL_HOST || (await listClusterNodes()).includes(host)) {
        return hostTarget(host);
    }

    return undefined;
}
