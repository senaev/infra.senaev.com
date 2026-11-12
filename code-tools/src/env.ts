import { requireEnv } from 'senaev-utils/src/utils/env/requireEnv/requireEnv';

/** cluster-helper sends it on every call; every route requires it. */
export const INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS = requireEnv('INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS');
