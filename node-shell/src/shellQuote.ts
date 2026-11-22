/**
 * Quotes one argument for a POSIX shell. ssh joins its arguments with spaces and the remote
 * login shell parses the result again, so each argument of the remote command is quoted to
 * reach the node unchanged.
 */
export function shellQuote(value: string): string {
    return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
}
