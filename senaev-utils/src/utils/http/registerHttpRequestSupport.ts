import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

/** Register inside the caller's plugin scope; unrelated routes stay unaffected. */
export async function registerHttpRequestSupport(instance: FastifyInstance): Promise<void> {
    await instance.register(formbody);
    await instance.register(cookie);
    await instance.register(rateLimit, { global: false });
}
