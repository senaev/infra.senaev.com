// src/env.ts validates the whole environment at import time so the container fails fast on
// a bad deploy. That means any test which transitively imports it needs these set before the
// module graph is evaluated, hence a setup file rather than a beforeEach.
process.env.OBSIDIAN_AUTH_TOKEN ??= 'test-token';
process.env.OBSIDIAN_VAULT_NAME ??= 'test-vault';
process.env.OBSIDIAN_VAULT_PATH ??= '/tmp/obsidian-sync-test-vault';
process.env.TG_TOKEN_SENAEV_COM_BOT ??= 'test-bot-token';
process.env.TG_CLUSTER_CHAT_ID ??= '-1000000000000';
