/**
 * Turns a caught value of unknown type into a human-readable message.
 *
 * This is not `wrapError(error).message`: `wrapError` replaces a non-Error,
 * non-object value with a placeholder, so `42` becomes `DEFAULT_ERROR_MESSAGE`
 * instead of `'42'`. For log and notification text the original value is what
 * the reader needs, so it is stringified as-is.
 */
export function stringifyUnknownError(error: unknown): string {
    return error instanceof Error
        ? error.message
        : String(error);
}
