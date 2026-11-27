import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

/** The node that node-shell runs on, and enters itself (`nodeShell.vps` in the Helm values). */
export const NODE_SHELL_LOCAL_HOST = requireEnv('NODE_SHELL_LOCAL_HOST');
/** The user of `ssh <user>@<node>` for the other nodes, from the local host. */
export const NODE_SHELL_SSH_USER = requireEnv('NODE_SHELL_SSH_USER');
/** A host directory, so the executions survive a restart of the pod. */
export const NODE_SHELL_STATE_DIRECTORY = requireEnv('NODE_SHELL_STATE_DIRECTORY');
