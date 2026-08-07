function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

/**
 * Read by the `ob` CLI straight from the process environment during `ob login`.
 * Validated here so the container fails fast with a clear message instead of the
 * CLI erroring out halfway through startup.
 */
export const OBSIDIAN_AUTH_TOKEN = requireEnv("OBSIDIAN_AUTH_TOKEN");
export const OBSIDIAN_VAULT_NAME = requireEnv("OBSIDIAN_VAULT_NAME");
export const OBSIDIAN_VAULT_PATH = requireEnv("OBSIDIAN_VAULT_PATH");
