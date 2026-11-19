import pino from 'pino';

export function createLogger({ name }: { name: string }) {
    return pino({ name });
}
