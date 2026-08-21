/** Directories that never contain syncable notes and would only add watch/scan cost. */
export const IGNORED_DIRECTORIES = new Set([
    '.obsidian',
    '.trash',
    '.git',
    'node_modules',
]);

/** True when any path segment is an ignored directory. */
export function isIgnoredPath(relativePath: string): boolean {
    return relativePath.split('/').some((segment) => IGNORED_DIRECTORIES.has(segment));
}
