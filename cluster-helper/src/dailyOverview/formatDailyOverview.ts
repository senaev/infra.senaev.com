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

/**
 * Highlighted (`==text==`) note name, shown literally. Only the characters that can start
 * inline markdown are backslash-escaped, so a plain name is sent unchanged.
 */
function markdownHighlight(text: string): string {
    return `==${text.replace(/[\\`*_=[\]<>~|]/g, '\\$&')}==`;
}

/**
 * Telegram makes a link out of every `@username` in the text. An invisible word joiner after
 * the `@` breaks the username, so a person note name such as `@annadodonova` stays plain text.
 */
const WORD_JOINER = '\u2060';

function preventMentionLinks(text: string): string {
    return text.replaceAll('@', `@${WORD_JOINER}`);
}

function formatMilestone({
    fileName, type, age, emoji,
}: Milestone): string {
    const label = TYPE_LABELS[type] ?? type;

    return [
        markdownHighlight(preventMentionLinks(fileName)),
        label === '' ? null : label,
        age === null ? null : `(${age})`,
        emoji,
    ].filter((part) => part !== null).join(' ');
}

/** Replaces the type emoji of tomorrow's milestones, like `tomorrowEmoji` in the plugin. */
const TOMORROW_EMOJI = '🔜';

function formatSection(title: string, milestones: Milestone[], emoji?: string): string | null {
    if (milestones.length === 0) {
        return null;
    }

    return [
        `### ${title}`,
        ...milestones.map((milestone) => `- ${formatMilestone({
            ...milestone,
            emoji: emoji ?? milestone.emoji,
        })}`),
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
    return `## 🔔 Доброе утро ${formatGenitiveRussianDay(isoDate)}`;
}

function formatCookingSection(): string {
    return [
        '### Что приготовить',
        '🍳 [mastereat.ru](https://mastereat.ru/)',
    ].join('\n');
}

/** The Telegram rich message markdown of the daily overview. */
export function formatDailyOverview({ today, tomorrow }: MilestonesOverview): string {
    const sections = [
        formatSection('Сегодня', today.milestones),
        formatSection('Завтра', tomorrow.milestones, TOMORROW_EMOJI),
    ].filter((section) => section !== null);

    return [
        formatHeader(today.date),
        ...(sections.length === 0 ? ['Сегодня и завтра событий нет 🤷‍♂️'] : sections),
        formatCookingSection(),
        'Хорошего дня, ваш Умный Папа ❤️',
    ].join('\n\n');
}
