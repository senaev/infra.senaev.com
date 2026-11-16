import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

/**
 * Read by the `ob` CLI straight from the process environment during `ob login`.
 * Validated here so the container fails fast with a clear message instead of the
 * CLI erroring out halfway through startup.
 */
export const OBSIDIAN_AUTH_TOKEN = requireEnv('OBSIDIAN_AUTH_TOKEN');
export const OBSIDIAN_VAULT_NAME = requireEnv('OBSIDIAN_VAULT_NAME');
export const OBSIDIAN_VAULT_PATH = requireEnv('OBSIDIAN_VAULT_PATH');

/** Used by telegram-post-sync to rewrite the channel posts that notes are cloned into. */
export const TG_TOKEN_SENAEV_COM_BOT = requireEnv('TG_TOKEN_SENAEV_COM_BOT');
/** Destination for sync failures that can't be surfaced anywhere else. */
export const TG_CLUSTER_CHAT_ID = requireEnv('TG_CLUSTER_CHAT_ID');

/** The mounted Secret of the mTLS certificate: `tls.key`, `tls.crt` and `ca.crt`. */
export const MTLS_DIR = requireEnv('MTLS_DIR');
/** The only service that may call the protected API: the DNS name in its client certificate. */
export const MTLS_ALLOWED_CLIENT_NAME = requireEnv('MTLS_ALLOWED_CLIENT_NAME');
