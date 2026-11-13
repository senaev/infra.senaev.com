import {
    describe, expect, it,
} from 'vitest';

import { describeTelegramUpdate } from './describeTelegramUpdate';

describe('describeTelegramUpdate', () => {
    it('returns only the update ID and the update types, not the content', () => {
        const description = describeTelegramUpdate({
            update_id: 42,
            message: {
                message_id: 7,
                text: 'private text',
                from: { id: 123 },
                chat: { id: -100 },
            },
        });

        expect(description).toEqual({
            updateId: 42,
            types: ['message'],
        });
        expect(JSON.stringify(description)).not.toContain('private text');
    });
});
