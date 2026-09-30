import {
    describe, expect, it,
} from 'vitest';

import { parseNoteFrontmatter } from './readVaultNotes';

describe('parseNoteFrontmatter', () => {
    it('keeps an unquoted date as a string and a boolean as a boolean', () => {
        expect(parseNoteFrontmatter('---\nbirthday: 1964-04-14\nmilestones-hidden: true\n---\nbody')).toEqual({
            birthday: '1964-04-14',
            'milestones-hidden': true,
        });
    });

    it('reads `yes` as a string, so it does not hide a note', () => {
        expect(parseNoteFrontmatter('---\nmilestones-hidden: yes\n---\n')).toEqual({ 'milestones-hidden': 'yes' });
    });

    it('accepts Windows line endings', () => {
        expect(parseNoteFrontmatter('---\r\nholiday: 0001-12-31\r\n---\r\n')).toEqual({ holiday: '0001-12-31' });
    });

    it('accepts a repeated key', () => {
        expect(parseNoteFrontmatter('---\nbirthday: 0001-01-01\nbirthday: 0001-02-02\n---\n')).toEqual({ birthday: '0001-02-02' });
    });

    it('gives null without frontmatter or for a non-object block', () => {
        expect(parseNoteFrontmatter('just text')).toBeNull();
        expect(parseNoteFrontmatter('---\n- a\n- b\n---\n')).toBeNull();
    });
});
