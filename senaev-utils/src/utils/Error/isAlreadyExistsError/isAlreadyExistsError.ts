/** Returns `true` for the Node filesystem error raised when a path already exists. */
export function isAlreadyExistsError(error: unknown): boolean {
    return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST';
}
