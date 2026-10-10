import {
    describe, expect, test,
} from 'vitest';

import { readStatusResponse } from './readStatusResponse';

function reply(status: number, body: string): Response {
    return new Response(status === 204 ? null : body, { status });
}

describe('readStatusResponse', () => {
    test('returns the body of an ok reply, and {} for one without a JSON object', async () => {
        expect(await readStatusResponse(reply(200, '{"status":"ok","id":"a1"}'))).toEqual({
            status: 'ok',
            id: 'a1',
        });
        expect(await readStatusResponse(reply(204, ''))).toEqual({});
        expect(await readStatusResponse(reply(201, 'Created'))).toEqual({});
    });

    test('throws with the message of an error reply, also on HTTP 200', async () => {
        await expect(readStatusResponse(reply(400, '{"status":"error","message":"Invalid link"}'))).rejects.toThrow(/^Invalid link$/);
        await expect(readStatusResponse(reply(200, '{"status":"error","message":"No"}'))).rejects.toThrow(/^No$/);
    });

    test('throws with the HTTP status and text when there is no message', async () => {
        await expect(readStatusResponse(reply(500, 'Internal Server Error'))).rejects.toThrow('HTTP 500 Internal Server Error');
        await expect(readStatusResponse(reply(502, '{"status":"error"}'))).rejects.toThrow('HTTP 502');
    });
});
