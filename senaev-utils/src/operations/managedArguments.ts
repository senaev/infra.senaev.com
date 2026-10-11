/** Execution envelope fields belong to the adapter, never to domain commands. */
export const MANAGED_ARGUMENT_KEYS = [
    'executionPolicy',
    'timeoutSeconds',
    'requestId',
] as const;

export function domainArguments(args: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(args).filter(([key]) => !(MANAGED_ARGUMENT_KEYS as readonly string[]).includes(key)));
}
