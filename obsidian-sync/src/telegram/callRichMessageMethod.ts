import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { promiseTimeout } from 'senaev-utils/src/utils/timers/promiseTimeout/promiseTimeout';

import { TG_TOKEN_SENAEV_COM_BOT } from '../env';
import { logger } from '../logger';
import type { ResolvedEmbed } from '../telegram-post-sync/render/resolveImageEmbeds';

// Verified empirically on 2026-08-08 — the Bot API documents no error strings at all, so
// this substring is the only way to recognise a no-op edit. Full message:
// "Bad Request: message is not modified: specified new message content and reply markup
//  are exactly the same as a current content and reply markup of the message"
const NOT_MODIFIED = 'message is not modified';

const MAX_RATE_LIMIT_RETRIES = 3;

type TelegramResponse<T> = {
    ok: boolean;
    result?: T;
    description?: string;
    error_code?: number;
    parameters?: { retry_after?: number };
};

export type RichMessageCallResult<T> = { status: 'ok'; result: T } | { status: 'not_modified' };

/**
 * Builds the multipart body. Rebuilt per attempt because a FormData holding Blobs can't be
 * reliably reused once fetch has consumed it.
 */
async function buildForm(
    base: Record<string, string>,
    markdown: string,
    media: ResolvedEmbed[]
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

        form.append(`${id}_file`, new Blob([bytes]), basename(absolutePath));
    }

    return form;
}

/**
 * Calls a rich-message Bot API method with multipart media upload, retrying on rate limits.
 *
 * "message is not modified" is reported rather than thrown, because the sync deliberately
 * re-pushes every tracked note on startup and identical content is the expected outcome.
 */
export async function callRichMessageMethod<T>({
    method,
    base,
    markdown,
    media,
}: {
    method: string;
    base: Record<string, string>;
    markdown: string;
    media: ResolvedEmbed[];
}): Promise<RichMessageCallResult<T>> {
    const url = `https://api.telegram.org/bot${TG_TOKEN_SENAEV_COM_BOT}/${method}`;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
        const response = await fetch(url, {
            method: 'POST',
            body: await buildForm(base, markdown, media),
        });
        const payload = (await response.json()) as TelegramResponse<T>;

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
            logger.warn({
                method,
                base,
                retryAfter,
            }, '⏳ Rate limited, retrying');
            await promiseTimeout(retryAfter * 1000);
            continue;
        }

        throw new Error(`${method} failed for ${JSON.stringify(base)}: ${description}`);
    }

    throw new Error(`${method} gave up after ${MAX_RATE_LIMIT_RETRIES} rate-limit retries`);
}
