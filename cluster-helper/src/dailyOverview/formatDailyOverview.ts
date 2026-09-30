import { escapeHtml } from 'senaev-utils/src/utils/String/escapeHtml/escapeHtml';
import { telegramBold, telegramCode } from 'senaev-utils/src/utils/TelegramApi/formatTelegramHtml/formatTelegramHtml';

import type { Milestone, MilestonesOverview } from '../obsidianSyncApi';

/**
 * Words after the note name, per milestone type. Same wording as the templates in the
 * Obsidian plugin's `milestones.json`; a type missing here is shown by its own name.
 */
const TYPE_LABELS: Record<string, string> = {
    birthday: 'birthday',
    holiday: '',
    death: 'death anniversary',
};

function formatMilestone({
    fileName, type, age, emoji,
}: Milestone): string {
    const label = TYPE_LABELS[type] ?? type;

    return [
        telegramCode(fileName),
        label === '' ? null : escapeHtml(label),
        age === null ? null : `(${age})`,
        escapeHtml(emoji),
    ].filter((part) => part !== null).join(' ');
}

function formatSection(title: string, milestones: Milestone[]): string | null {
    if (milestones.length === 0) {
        return null;
    }

    return [
        telegramBold(title),
        ...milestones.map(formatMilestone),
    ].join('\n');
}

/** The Telegram HTML text of the daily overview message. */
export function formatDailyOverview({ today, tomorrow }: MilestonesOverview): string {
    const sections = [
        formatSection('События сегодня:', today.milestones),
        formatSection('Завтра:', tomorrow.milestones),
    ].filter((section) => section !== null);

    return [
        ...(sections.length === 0 ? ['Сегодня и завтра событий нет 🤷‍♂️'] : sections),
        'Хорошего дня, ваш Умный Папа ❤️',
    ].join('\n\n');
}
