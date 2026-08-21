/**
 * Returns `true` for the Node filesystem error raised when a path does not
 * exist, so a caller can treat "no such file" as an empty result rather than a
 * failure.
 */
export function isNotFoundError(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
