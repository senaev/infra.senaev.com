// src/env.ts validates the environment at import time, so tests that import it need this
// value before the module graph is evaluated.
process.env.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS ??= 'test-internal-token';
