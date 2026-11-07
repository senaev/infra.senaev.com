import { request as httpRequest } from 'node:http';
import type { Readable } from 'node:stream';

export type UpstreamResponse = {
    status: number;
    contentType: string | undefined;
    body: Readable;
};

export type RequestUpstream = (input: {
    url: string;
    body: string;
    signal: AbortSignal;
}) => Promise<UpstreamResponse>;

/**
 * POSTs a JSON body to an in-cluster HTTP upstream. node:http and not fetch: fetch stops
 * waiting for the response headers after 5 minutes, and llm-server sends them only after
 * the whole answer when the client does not stream.
 */
export const requestUpstream: RequestUpstream = ({
    url, body, signal,
}) => new Promise((resolve, reject) => {
    const upstream = httpRequest(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
        },
        signal,
    }, (response) => {
        resolve({
            status: response.statusCode ?? 502,
            contentType: response.headers['content-type'],
            body: response,
        });
    });

    upstream.on('error', reject);
    upstream.end(body);
});
