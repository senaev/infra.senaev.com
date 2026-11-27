export type HostTarget = { kind: 'local' } | { kind: 'ssh'; destination: string };

export type HostResolver = {
    /** `undefined` for a host that is not a node; rejects when the node list cannot be read. */
    resolve: (host: string) => Promise<HostTarget | undefined>;
};

// A `vps` label, which is also the host's tailnet name: nothing that ssh could read as an option.
const HOST_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SSH_USER = /^[a-z_][a-z0-9_-]*$/;

export const NODE_LIST_TTL_MS = 60_000;

export function parseNodeList(output: string): string[] {
    return [...new Set(output.split('\n').map((line) => line.trim()).filter((name) => HOST_NAME.test(name)))];
}

export const NODE_LIST_JSONPATH = 'jsonpath={range .items[*]}{.metadata.labels.vps}{"\\n"}{end}';

export function createHostResolver({
    localHost, sshUser, listNodes,
}: {
    localHost: string;
    sshUser: string;
    listNodes: () => Promise<string[]>;
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
        if (cached !== undefined && Date.now() - cached.readAt < NODE_LIST_TTL_MS) {
            return Promise.resolve(cached.names);
        }

        reading ??= listNodes()
            .then((names) => {
                cached = {
                    names: new Set(names),
                    readAt: Date.now(),
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
