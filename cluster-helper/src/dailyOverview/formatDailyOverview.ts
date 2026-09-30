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

const RUSSIAN_DAY_FORMAT = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    // The date carries no time zone of its own, so it is read and printed as UTC.
    timeZone: 'UTC',
});

/** `2025-11-29` → `суббота, 29 ноября` */
function formatRussianDay(isoDate: string): string {
    return RUSSIAN_DAY_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));
}

function formatHeader(isoDate: string, hasMilestones: boolean): string {
    const intro = hasMilestones ? ' Вот что важно не пропустить:' : '';

    return [
        `🔔 ${telegramBold('Доброе утро!')}`,
        `Сегодня ${escapeHtml(formatRussianDay(isoDate))}.${intro}`,
    ].join('\n');
}

/** The Telegram HTML text of the daily overview message. */
export function formatDailyOverview({ today, tomorrow }: MilestonesOverview): string {
    const sections = [
        formatSection('События сегодня:', today.milestones),
        formatSection('Завтра:', tomorrow.milestones),
    ].filter((section) => section !== null);

    return [
        formatHeader(today.date, sections.length > 0),
        ...(sections.length === 0 ? ['Сегодня и завтра событий нет 🤷‍♂️'] : sections),
        'Хорошего дня, ваш Умный Папа ❤️',
    ].join('\n\n');
}
