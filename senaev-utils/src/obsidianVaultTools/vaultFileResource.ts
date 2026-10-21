import { invalidArguments } from '../commands/CommandError';

/** Resource URIs identify a vault file version; authorization still comes from MCP OAuth. */
export function vaultFileResourceUri(path: string, hash: string): string {
    return `obsidian-vault://file/${encodeURIComponent(path)}?sha256=${hash}`;
}

/** Accept only our exact URI format, never arbitrary HTTP URLs or filesystem locations. */
export function parseVaultFileResourceUri(value: unknown): { path: string; hash: string } {
    if (typeof value !== 'string') {
        throw invalidArguments('Expected a vault file resource URI');
    }

    const match = /^obsidian-vault:\/\/file\/([^/?#]+)\?sha256=([a-f0-9]{64})$/u.exec(value);

    if (match === null) {
        throw invalidArguments('Invalid vault file resource URI');
    }

    try {
        return {
            path: decodeURIComponent(match[1] ?? ''),
            hash: match[2] ?? '',
        };
    } catch {
        throw invalidArguments('Invalid encoded vault file path');
    }
}
