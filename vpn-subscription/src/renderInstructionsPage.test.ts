import {
    describe, expect, it,
} from 'vitest';

import { renderInstructionsPage } from './renderInstructionsPage';

function render(overrides: Partial<Parameters<typeof renderInstructionsPage>[0]> = {}): string {
    return renderInstructionsPage({
        title: 'VPN',
        subscriptionUrl: 'https://vpn.senaev.com/secret',
        announcements: [],
        telegramChatUrl: 'https://t.me/example',
        ...overrides,
    });
}

describe('renderInstructionsPage', () => {
    it('leaves no placeholder unsubstituted', () => {
        const html = render({ announcements: ['Anything'] });

        expect(html).not.toMatch(/\{[A-Z_]+\}/);
    });

    it('builds the happ import link from the subscription url', () => {
        const html = render();

        expect(html).toContain('happ://add/https://vpn.senaev.com/secret');
    });

    it('renders each announcement as its own list item', () => {
        const html = render({
            announcements: [
                'First',
                'Second',
            ],
        });

        expect(html).toContain('<li>First</li><li>Second</li>');
    });

    // The page is served to anyone who has the link, so any value interpolated into it has
    // to be escaped rather than trusted.
    it('escapes announcements instead of injecting them as markup', () => {
        const html = render({ announcements: ['<script>alert(1)</script>'] });

        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('escapes the title', () => {
        const html = render({ title: 'A & B' });

        expect(html).toContain('A &amp; B');
    });

    // The template carries static list items of its own, so the assertion has to be about
    // what this function adds rather than about the page as a whole.
    it('adds no list items when there are no announcements', () => {
        const countListItems = (html: string): number => html.split('<li>').length - 1;

        expect(countListItems(render({ announcements: [] })))
            .toBe(countListItems(render({ announcements: ['Only one'] })) - 1);
    });
});
