import {
    beforeEach, describe, expect, it, vi,
} from 'vitest';

import { replaceTrackingLinkInFrontmatter } from './replaceTrackingLinkInFrontmatter';
import { updateNoteFrontmatter } from './updateNoteFrontmatter';

vi.mock('./updateNoteFrontmatter', () => {
    return { updateNoteFrontmatter: vi.fn() };
});

vi.mock('../logger', () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

const CHANNEL_LINK = 'https://t.me/c/1728968094';
const POST_LINK = 'https://t.me/c/1728968094/107';

/**
 * Runs the real rewrite against in-memory note lines. The file layer is mocked out because
 * what matters here is which single line changes, not how it reaches the disk.
 */
async function rewrite(lines: string[], originalLink = CHANNEL_LINK): Promise<string[]> {
    let result: string[] | undefined;

    vi.mocked(updateNoteFrontmatter).mockImplementation((_relativePath, mutate) => {
        result = mutate({
            lines,
            closingIndex: lines.indexOf('---', 1),
        });

        return Promise.resolve();
    });

    await replaceTrackingLinkInFrontmatter('note.md', originalLink, POST_LINK);

    if (result === undefined) {
        throw new Error('the rewrite never ran');
    }

    return result;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('replaceTrackingLinkInFrontmatter', () => {
    it('rewrites a scalar value', async () => {
        const result = await rewrite([
            '---',
            `telegram-post-clone: ${CHANNEL_LINK}`,
            '---',
            'body',
        ]);

        expect(result[1]).toBe(`telegram-post-clone: ${POST_LINK}`);
    });

    it('rewrites one entry of an inline list and leaves the other alone', async () => {
        const result = await rewrite([
            '---',
            `telegram-post-clone: [${CHANNEL_LINK}, https://t.me/c/999]`,
            '---',
        ]);

        expect(result[1]).toBe(`telegram-post-clone: [${POST_LINK}, https://t.me/c/999]`);
    });

    it('rewrites one item of a block list and preserves its indentation', async () => {
        const result = await rewrite([
            '---',
            'telegram-post-clone:',
            '  - https://t.me/c/999',
            `  - ${CHANNEL_LINK}`,
            '---',
        ]);

        expect(result[2]).toBe('  - https://t.me/c/999');
        expect(result[3]).toBe(`  - ${POST_LINK}`);
    });

    it('changes nothing outside the matched entry', async () => {
        const lines = [
            '---',
            'title: Trip notes',
            `telegram-post-clone: ${CHANNEL_LINK}`,
            'tags: [travel]',
            '---',
            '# Heading',
            '',
            'Body text with --- inside it.',
        ];

        const result = await rewrite(lines);

        expect(result.filter((line, index) => line !== lines[index])).toHaveLength(1);
    });

    it('replaces only the first entry when the same channel is listed twice', async () => {
        const result = await rewrite([
            '---',
            'telegram-post-clone:',
            `  - ${CHANNEL_LINK}`,
            `  - ${CHANNEL_LINK}`,
            '---',
        ]);

        expect(result[2]).toBe(`  - ${POST_LINK}`);
        expect(result[3]).toBe(`  - ${CHANNEL_LINK}`);
    });

    it('matches an entry that is quoted in the note', async () => {
        const result = await rewrite([
            '---',
            `telegram-post-clone: "${CHANNEL_LINK}"`,
            '---',
        ]);

        expect(result[1]).toBe(`telegram-post-clone: ${POST_LINK}`);
    });

    // Writing a link the sync cannot parse would make the note look untracked, and the next
    // edit would publish a second post for it.
    it('refuses to write a link that is not a post link, without touching the file', async () => {
        await expect(replaceTrackingLinkInFrontmatter('note.md', CHANNEL_LINK, CHANNEL_LINK))
            .rejects.toThrow(/Refusing to write an unusable/);

        expect(updateNoteFrontmatter).not.toHaveBeenCalled();
    });

    it('fails when the note no longer lists the link', async () => {
        await expect(rewrite([
            '---',
            'telegram-post-clone: https://t.me/c/555',
            '---',
        ])).rejects.toThrow(/no longer lists/);
    });

    it('fails when the tracking key is gone', async () => {
        await expect(rewrite([
            '---',
            'title: Something else',
            '---',
        ])).rejects.toThrow(/no longer has a telegram-post-clone key/);
    });
});
