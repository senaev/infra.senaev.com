import pino, { LoggerOptions } from 'pino';

/**
 * Datadog takes the status of a log line from `level` only as a name ("error"), not as the
 * number that pino writes by default (50): with numbers, every line is "info".
 */
export const LOGGER_OPTIONS: LoggerOptions = {
    formatters: {
        level: (label) => {
            return { level: label };
        },
    },
};

export function createLogger({ name }: { name: string }) {
    return pino({
        name,
        ...LOGGER_OPTIONS,
    });
}
