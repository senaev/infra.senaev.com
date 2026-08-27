import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { promiseTimeout } from '../timers/promiseTimeout/promiseTimeout';

import { createTelegramApiBaseUrl } from './createTelegramApiBaseUrl';
import { TelegramApiResponse, TelegramRichMessageMedia } from './types';

// Verified empirically on 2026-08-08 — the Bot API documents no error strings at all, so
// this substring is the only way to recognise a no-op edit. Full message:
// "Bad Request: message is not modified: specified new message content and reply markup
//  are exactly the same as a current content and reply markup of the message"
const NOT_MODIFIED = 'message is not modified';

const MAX_RATE_LIMIT_RETRIES = 3;

export type RichMessageCallResult<T> = { status: 'ok'; result: T } | { status: 'not_modified' };

/**
 * Builds the multipart body. Rebuilt per attempt because a FormData holding Blobs can't be
 * reliably reused once fetch has consumed it.
 */
async function buildForm(
    base: Record<string, string>,
    markdown: string,
    media: TelegramRichMessageMedia[]
): Promise<FormData> {
    const form = new FormData();

    for (const [
        key,
        value,
    ] of Object.entries(base)) {
        form.append(key, value);
    }

    const richMessage = {
        markdown,
        ...(media.length > 0 && {
            media: media.map(({ id }) => {
                return {
                    id,
                    media: {
                        type: 'photo',
                        media: `attach://${id}_file`,
                    },
                };
            }),
        }),
    };

    form.append('rich_message', JSON.stringify(richMessage));

    for (const { id, absolutePath } of media) {
        const bytes = await readFile(absolutePath);

        // Copied into a plain Uint8Array because this package is typed against the DOM lib,
        // whose Blob rejects a Node Buffer: its backing store is ArrayBufferLike, which may
        // be a SharedArrayBuffer.
        form.append(`${id}_file`, new Blob([new Uint8Array(bytes)]), basename(absolutePath));
    }

    return form;
}

/**
 * Calls a rich-message Bot API method with multipart media upload, retrying on rate limits.
 *
 * "message is not modified" is reported rather than thrown, because a caller that re-pushes
 * unchanged content on every pass expects identical content to be the normal outcome.
 *
 * onRateLimited is called before each wait. The retries happen inside this function with
 * nobody else watching, so this is the only place a caller can observe them.
 */
export async function callTelegramRichMessageMethod<T>({
    method,
    base,
    markdown,
    media,
    token,
    onRateLimited,
}: {
    method: string;
    base: Record<string, string>;
    markdown: string;
    media: TelegramRichMessageMedia[];
    token: string;
    onRateLimited?: ((info: { retryAfterSeconds: number; attempt: number }) => void) | undefined;
}): Promise<RichMessageCallResult<T>> {
    const url = `${createTelegramApiBaseUrl(token)}/${method}`;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
        const response = await fetch(url, {
            method: 'POST',
            body: await buildForm(base, markdown, media),
        });
        const payload = (await response.json()) as TelegramApiResponse<T>;

        if (payload.ok && payload.result !== undefined) {
            return {
                status: 'ok',
                result: payload.result,
            };
        }

        const description = payload.description ?? 'unknown error';

        if (description.includes(NOT_MODIFIED)) {
            return { status: 'not_modified' };
        }

        const retryAfter = payload.parameters?.retry_after;

        if (
            payload.error_code === 429 && retryAfter !== undefined && attempt < MAX_RATE_LIMIT_RETRIES
        ) {
            onRateLimited?.({
                retryAfterSeconds: retryAfter,
                attempt,
            });
            await promiseTimeout(retryAfter * 1000);
            continue;
        }

        throw new Error(`${method} failed for ${JSON.stringify(base)}: ${description}`);
    }

    throw new Error(`${method} gave up after ${MAX_RATE_LIMIT_RETRIES} rate-limit retries`);
}
