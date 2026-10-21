import type { RateLimitOptions } from '@fastify/rate-limit';

/** Route-scoped limit: independent keys prevent one endpoint from locking another. */
export function httpRateLimit(
    key: string,
    { max = 60, timeWindow = '1 minute' }: Pick<RateLimitOptions, 'max' | 'timeWindow'> = {}
) {
    return {
        config: {
            rateLimit: {
                max,
                timeWindow,
                keyGenerator: () => key,
            },
        },
    };
}
