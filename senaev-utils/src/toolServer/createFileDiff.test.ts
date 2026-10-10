import {
    describe, expect, it,
} from 'vitest';

import { createFileDiff } from './createFileDiff';

describe('createFileDiff', () => {
    it('makes a unified diff with the path in the header and no "=" banner', () => {
        expect(createFileDiff('Note.md', 'a\nb\n', 'a\nc\n')).toEqual({
            diff: '--- a/Note.md\n+++ b/Note.md\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n',
            diffTruncated: false,
        });
    });

    it('keeps only 3 lines of context around a change', () => {
        const before = `${Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n')}\n`;
        const { diff } = createFileDiff('Note.md', before, before.replace('line 10\n', 'changed\n'));

        expect(diff).toContain(' line 7\n line 8\n line 9\n-line 10\n+changed\n line 11\n line 12\n line 13\n');
        expect(diff).not.toContain('line 6\n');
        expect(diff).not.toContain('line 14\n');
    });

    it('cuts a diff longer than 20,000 characters and says so', () => {
        const result = createFileDiff('Big.md', '', `${'x'.repeat(100)}\n`.repeat(300));

        expect(result.diffTruncated).toBe(true);
        expect(result.diff).toHaveLength(20_000);
    });
});
