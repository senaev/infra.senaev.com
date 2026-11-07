import {
    createServer, type IncomingMessage, type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { requestUpstream } from './requestUpstream';

let upstream: Server;
let url: string;
let received: { headers: IncomingMessage['headers']; body: string } | undefined;

beforeEach(async () => {
    received = undefined;
    upstream = createServer((request, response) => {
        void text(request).then((body) => {
            received = {
                headers: request.headers,
                body,
            };
            response.writeHead(201, { 'content-type': 'text/event-stream' });
            response.write('data: one\n\n');
            response.end('data: [DONE]\n\n');
        });
    });
    await new Promise<void>((resolve) => {
        upstream.listen(0, '127.0.0.1', resolve);
    });
    url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1/chat/completions`;
});

afterEach(async () => {
    await new Promise((resolve) => {
        upstream.close(resolve);
    });
});

describe('requestUpstream', () => {
    it('posts the JSON body and streams back the status, content type and body', async () => {
        const body = '{"model":"home/qwen3-4b","content":"Привет"}';
        const response = await requestUpstream({
            url,
            body,
            signal: new AbortController().signal,
        });

        expect(response.status).toBe(201);
        expect(response.contentType).toBe('text/event-stream');
        expect(await text(response.body)).toBe('data: one\n\ndata: [DONE]\n\n');
        expect(received?.body).toBe(body);
        expect(received?.headers['content-type']).toBe('application/json');
        expect(received?.headers['content-length']).toBe(String(Buffer.byteLength(body)));
    });

    it('rejects when the upstream is unreachable', async () => {
        await new Promise((resolve) => {
            upstream.close(resolve);
        });
        upstream = createServer();
        upstream.listen(0);

        await expect(requestUpstream({
            url,
            body: '{}',
            signal: new AbortController().signal,
        })).rejects.toThrow(/ECONNREFUSED/);
    });
});
