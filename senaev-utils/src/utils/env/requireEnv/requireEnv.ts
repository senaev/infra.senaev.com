/**
 * Reads an environment variable, throwing when it is missing.
 *
 * The check is deliberately falsy rather than `=== undefined`: an empty string
 * is treated as missing, because an unset value in a Kubernetes manifest or a
 * `.env` file usually arrives as `''` rather than being absent.
 */
export function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}
