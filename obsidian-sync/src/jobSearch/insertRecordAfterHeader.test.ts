import {
    describe, expect, it,
} from 'vitest';

import { insertRecordAfterHeader } from './insertRecordAfterHeader';

const HEADER = '# LLM Recommendations Log\n\nThe recommendations, newest first.\n\n---\n';

describe('insertRecordAfterHeader', () => {
    it('adds the first record under the header', () => {
        expect(insertRecordAfterHeader(HEADER, '## [[2026-11-22]] 04:00 UTC', '**Round**\n\n1. Apply')).toBe(`${HEADER}\n## [[2026-11-22]] 04:00 UTC\n\n**Round**\n\n1. Apply\n`);
    });

    it('puts a new record above the earlier ones', () => {
        const content = `${HEADER}\n## [[2026-11-21]] 04:00 UTC\n\nOld\n`;

        expect(insertRecordAfterHeader(content, '## [[2026-11-22]] 04:00 UTC', 'New\n')).toBe(`${HEADER}\n## [[2026-11-22]] 04:00 UTC\n\nNew\n\n## [[2026-11-21]] 04:00 UTC\n\nOld\n`);
    });

    it('keeps a `---` inside an earlier record in place', () => {
        const content = `${HEADER}\n## [[2026-11-21]] 04:00 UTC\n\nA\n\n---\n\nB\n`;
        const result = insertRecordAfterHeader(content, '## [[2026-11-22]] 04:00 UTC', 'New');

        expect(result.indexOf('New')).toBeLessThan(result.indexOf('## [[2026-11-21]]'));
        expect(result.endsWith('A\n\n---\n\nB\n')).toBe(true);
    });

    it('rejects a note without the header separator', () => {
        expect(() => insertRecordAfterHeader('# Log\n', '## x', 'y')).toThrow('---');
    });
});
