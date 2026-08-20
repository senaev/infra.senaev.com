export function stringifyError(error: Error): string {
    return `error.message=[${error.message}] error.stack=[${error.stack}]`;
}
