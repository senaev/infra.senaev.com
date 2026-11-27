/** Where a command for a host runs: in the local host itself, or through ssh from there. */
export type HostTarget = { kind: 'local' } | { kind: 'ssh'; destination: string };

export type HostResolver = {
    /**
     * The target of a host name, or `undefined` for a host that does not accept commands.
     * Rejects when the list of nodes cannot be read.
     */
    resolve: (host: string) => Promise<HostTarget | undefined>;
};

// A `vps` label, which is also the host's tailnet name: nothing that ssh could read as an option.
const HOST_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SSH_USER = /^[a-z_][a-z0-9_-]*$/;

/** The hosts are the cluster nodes: newer nodes than this need no change of node-shell. */
export const NODE_LIST_TTL_MS = 60_000;

/**
 * The `vps` labels of the cluster nodes, as printed by `kubectl get nodes` with
 * `NODE_LIST_JSONPATH`: one per line. A node without a valid label is left out.
 */
export function parseNodeList(output: string): string[] {
    return [...new Set(output.split('\n').map((line) => line.trim()).filter((name) => HOST_NAME.test(name)))];
}

export const NODE_LIST_JSONPATH = 'jsonpath={range .items[*]}{.metadata.labels.vps}{"\\n"}{end}';

/**
 * Resolves host names against the cluster nodes, by their `vps` label: the node that node-shell
 * runs on is `localHost`, and every other node is `sshUser@<label>`, reached with ssh from the local
 * host by its tailnet name. The list is read with `listNodes` and kept for `ttlMs`, so a node that
 * joins or leaves the cluster is seen within a minute, and concurrent requests share one read.
 */
export function createHostResolver({
    localHost, sshUser, listNodes, ttlMs = NODE_LIST_TTL_MS, now = Date.now,
}: {
    localHost: string;
    sshUser: string;
    listNodes: () => Promise<string[]>;
    ttlMs?: number;
    now?: () => number;
}): HostResolver {
    if (!HOST_NAME.test(localHost)) {
        throw new Error(`Invalid local host name: ${localHost}`);
    }

    if (!SSH_USER.test(sshUser)) {
        throw new Error(`Invalid SSH user: ${sshUser}`);
    }

    let cached: { names: ReadonlySet<string>; readAt: number } | undefined;
    let reading: Promise<ReadonlySet<string>> | undefined;

    const nodeNames = (): Promise<ReadonlySet<string>> => {
        if (cached !== undefined && now() - cached.readAt < ttlMs) {
            return Promise.resolve(cached.names);
        }

        reading ??= listNodes()
            .then((names) => {
                cached = {
                    names: new Set(names),
                    readAt: now(),
                };

                return cached.names;
            })
            .finally(() => {
                reading = undefined;
            });

        return reading;
    };

    return {
        async resolve(host) {
            if (!HOST_NAME.test(host)) {
                return undefined;
            }

            if (host === localHost) {
                return { kind: 'local' };
            }

            return (await nodeNames()).has(host)
                ? {
                    kind: 'ssh',
                    destination: `${sshUser}@${host}`,
                }
                : undefined;
        },
    };
}
