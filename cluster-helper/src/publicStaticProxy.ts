import { posix } from 'node:path';
import { Readable } from 'node:stream';

import { OBSIDIAN_SYNC_URL } from './env';

/** Trailing slash is load-bearing: see the prefix check in buildUpstreamPath. */
const UPSTREAM_PREFIX = '/public-static/';

/**
 * Passed straight through from the caller so conditional and ranged requests
 * survive the extra hop; without them every reload would re-download the file.
 */
const FORWARDED_REQUEST_HEADERS = [
    'if-none-match',
    'if-modified-since',
    'range',
] as const;

/** Everything the browser needs to cache and render the file correctly. */
const FORWARDED_RESPONSE_HEADERS = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
] as const;

export type PublicStaticResult = {
    status: number;
    headers: Record<string, string>;
    body: Readable | string;
};

/**
 * Builds the upstream URL and proves it stayed under the prefix, returning
 * `null` to reject the request.
 *
 * This is a security boundary, not tidying. obsidian-sync serves `POST /tasks`
 * and `/short_links` alongside the static files, so a `..` that survives to the
 * end would walk the request out of `/public-static/` and onto one of them.
 *
 * The containment is checked twice, because the path is normalised twice and
 * each pass understands different things as a separator:
 *
 * - `posix.join` collapses a literal `..`, but reads `%2e%2e` and `\` as
 *   ordinary characters.
 * - The URL parser, which `fetch` runs on whatever it is given, collapses all
 *   three.
 *
 * Checking only the first pass leaves `%252e%252e/tasks` reaching `/tasks`: one
 * decode turns it into `%2e%2e`, which `join` keeps and the URL parser then
 * resolves. Checking the parsed `pathname` closes that, because it inspects the
 * exact bytes that will go out.
 *
 * The prefix is compared including its trailing slash, or a sibling path like
 * `/public-static-evil` would satisfy it.
 */
function buildUpstreamUrl(rawPath: string): URL | null {
    let decoded: string;

    try {
        decoded = decodeURIComponent(rawPath);
    } catch {
        return null;
    }

    if (decoded.includes('\0')) {
        return null;
    }

    const joined = posix.join(UPSTREAM_PREFIX, decoded);

    if (!joined.startsWith(UPSTREAM_PREFIX)) {
        return null;
    }

    let url: URL;

    try {
        url = new URL(`${OBSIDIAN_SYNC_URL}${joined}`);
    } catch {
        return null;
    }

    if (!url.pathname.startsWith(UPSTREAM_PREFIX)) {
        return null;
    }

    return url;
}

/**
 * Serves https://static.senaev.com by proxying to the obsidian-sync container,
 * which is ClusterIP-only and holds the vault. Traefik rewrites the public path
 * onto `/public-static/...` before it arrives here.
 *
 * The body is streamed rather than buffered, so a large PDF never sits in this
 * process's memory.
 */
export async function proxyPublicStaticFile({
    path,
    requestHeaders,
}: {
    path: string;
    requestHeaders: Record<string, string | string[] | undefined>;
}): Promise<PublicStaticResult> {
    const upstreamUrl = buildUpstreamUrl(path);

    if (upstreamUrl === null) {
        return {
            status: 400,
            headers: { 'content-type': 'text/plain' },
            body: 'Bad Request',
        };
    }

    const headers: Record<string, string> = {};

    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = requestHeaders[name];

        if (typeof value === 'string') {
            headers[name] = value;
        }
    }

    const response = await fetch(upstreamUrl, { headers });

    if (response.status === 404) {
        return {
            status: 404,
            headers: { 'content-type': 'text/plain' },
            body: 'Not Found',
        };
    }

    const responseHeaders: Record<string, string> = {
        // The files are user-authored HTML on a senaev.com subdomain, so stop
        // browsers guessing a different content type than the one we send.
        'x-content-type-options': 'nosniff',
    };

    for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = response.headers.get(name);

        if (value !== null) {
            responseHeaders[name] = value;
        }
    }

    if (response.body === null) {
        return {
            status: response.status,
            headers: responseHeaders,
            body: '',
        };
    }

    return {
        status: response.status,
        headers: responseHeaders,
        // `Readable.from` rather than `Readable.fromWeb`: a web stream is async
        // iterable, and taking that route avoids a cast between undici's
        // ReadableStream and the one in node:stream/web, whose types disagree.
        body: Readable.from(response.body),
    };
}
