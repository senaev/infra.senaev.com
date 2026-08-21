import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolved against this module rather than the working directory, so the page renders the
// same no matter where the process was started from.
const INSTRUCTIONS_TEMPLATE_PATH = resolve(__dirname, 'instructions-page.html');

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

export function renderInstructionsPage({
    subscriptionUrl,
    title,
    announcements,
    telegramChatUrl,
}: {
    subscriptionUrl: string;
    title: string;
    announcements: string[];
    telegramChatUrl: string;
}): string {
    const template = readFileSync(INSTRUCTIONS_TEMPLATE_PATH, 'utf8');
    const happLink = `happ://add/${subscriptionUrl}`;
    const renderedAnnouncements = announcements
        .map((announcement) => `<li>${escapeHtml(announcement)}</li>`)
        .join('');

    return template
        .replaceAll('{TITLE}', escapeHtml(title))
        .replaceAll('{HAPP_LINK}', escapeHtml(happLink))
        .replaceAll('{TELEGRAM_CHAT_URL}', escapeHtml(telegramChatUrl))
        .replaceAll('{ANNOUNCEMENTS}', renderedAnnouncements);
}
