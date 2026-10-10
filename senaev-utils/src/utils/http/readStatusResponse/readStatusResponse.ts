import { isObject } from '../../../types/Object/Object';

function parseJsonObject(text: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(text);

        return isObject(value) && !Array.isArray(value) ? value : null;
    } catch {
        return null;
    }
}

/**
 * Reads the reply of an API that answers `{ status: "ok", ... }` or
 * `{ status: "error", message }`. Returns the JSON body of a successful reply, or `{}` when
 * it has no JSON object body (such as `204`, or a plain-text `201 Created`). Throws for an
 * HTTP error or `status: "error"`; the error text is the `message` of the reply when it has
 * one, so it can be shown to a person as it is.
 */
export async function readStatusResponse(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    const body = parseJsonObject(text);
    const isSuccess = response.ok && body?.status !== 'error';

    if (isSuccess) {
        return body ?? {};
    }

    const message = typeof body?.message === 'string' && body.message !== ''
        ? body.message
        : `HTTP ${response.status}${text === '' ? '' : ` ${text}`}`;

    throw new Error(message);
}
