import { escapeHtml } from 'senaev-utils/src/utils/String/escapeHtml/escapeHtml';
import {
    telegramBold, telegramCode, telegramLink,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramHtml/formatTelegramHtml';

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

// Intl has no genitive weekday ("утро субботы"), so the forms are listed here, indexed by
// `getUTCDay()`. The month after a day number is already genitive in Intl ("25 января").
const GENITIVE_WEEKDAYS = [
    'воскресенья',
    'понедельника',
    'вторника',
    'среды',
    'четверга',
    'пятницы',
    'субботы',
] as const;

const RUSSIAN_DAY_AND_MONTH_FORMAT = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    // The date carries no time zone of its own, so it is read and printed as UTC.
    timeZone: 'UTC',
});

/** `2025-11-29` → `субботы, 29 ноября` */
function formatGenitiveRussianDay(isoDate: string): string {
    const date = new Date(`${isoDate}T00:00:00Z`);

    return `${GENITIVE_WEEKDAYS[date.getUTCDay()]}, ${RUSSIAN_DAY_AND_MONTH_FORMAT.format(date)}`;
}

function formatHeader(isoDate: string): string {
    return `🔔 ${telegramBold(`Доброе утро ${formatGenitiveRussianDay(isoDate)}`)}`;
}

function formatCookingSection(): string {
    return [
        telegramBold('Что приготовить:'),
        `🍳 ${telegramLink({
            text: 'mastereat.ru',
            url: 'https://mastereat.ru/',
        })}`,
    ].join('\n');
}

/** The Telegram HTML text of the daily overview message. */
export function formatDailyOverview({ today, tomorrow }: MilestonesOverview): string {
    const sections = [
        formatSection('Сегодня:', today.milestones),
        formatSection('Завтра:', tomorrow.milestones),
    ].filter((section) => section !== null);

    return [
        formatHeader(today.date),
        ...(sections.length === 0 ? ['Сегодня и завтра событий нет 🤷‍♂️'] : sections),
        formatCookingSection(),
        'Хорошего дня, ваш Умный Папа ❤️',
    ].join('\n\n');
}
