/** Marker used by Periodic Notes, core Templates and manual insertion. */
export const DAILY_NOTE_TEMPLATE_MARKER = '<!-- senaev:daily-note-template -->';

/** Strict calendar-date parsing, independent of locale and UTC conversion. */
export function parseDailyDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(0);
	date.setFullYear(year, month - 1, day);
	date.setHours(12, 0, 0, 0);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
		? date : null;
}

/** Only direct children of the configured daily folder are daily notes. */
export function dailyDateFromPath(path: string): string | null {
	const match = /^periodic\/day\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
	return match?.[1] && parseDailyDate(match[1]) ? match[1] : null;
}

function renderDailyBody(value: string): string {
	const date = parseDailyDate(value);
	if (!date) throw new Error(`Invalid daily note date: ${value}`);
	const result: string[] = [];
	const weekday = date.getDay();
	if (weekday !== 0 && weekday !== 6) {
		result.push('', '- [ ] Spend time solving [[Leetcode]] task', '');
	}
	if (date.getDate() === 1) result.push('- [ ] Write [[LinkedIn]] post');
	if (weekday === 6) {
		result.push('- [ ] Write [[@senaev_speaks]] post', '', '- [ ] Call [[@mom]]');
	}
	if (weekday === 0) result.push('- [ ] [[🥞 Sunday Breakfast]]');
	result.push('', '', '', '---');
	const quarter = Math.floor(date.getMonth() / 3) + 1;
	result.push(`- [ ] [[Work achievements]] for [[${date.getFullYear()}q${quarter}#${value}]]`);
	return result.join('\n');
}

/** The complete editable daily note; headers and footers remain plugin widgets. */
export function renderDailyNote(date: string): string {
	return `
- [ ] [[⏰ Wake up consistently]]
- [ ] [[🏋️ Full-body exercises]]
- [ ] [[🚿 Cold shower]]
\`\`\`tasks
filter by function window.senaevPersonalTools.filterTasksForDaily({task, query})
sort by function window.senaevPersonalTools.sortKeyForDaily({task})
\`\`\`

---

${renderDailyBody(date)}

---
![[daily_note_stream]]



---

- [ ] [[⏰ Plan the next day]]
- [ ] [[🥣 Take care of breakfast and lunch]]
- [ ] [[🫰 Give attention to @luli in the evening]]
- [ ] [[🚭 Do not smoke]]
- [ ] [[📵 More boredom (➕output) = less junk (➖input)]]
- [ ] [[✍️ Daily Journaling]]
`;
}

/** Pure, idempotent transformation. Never replace existing unmarked user content. */
export function initializeDailyNote(path: string, content: string): string {
	const date = dailyDateFromPath(path);
	if (!date) return content;
	if (content.trim() === '') return renderDailyNote(date);
	// A standalone marker is an explicit request to insert the template. Fenced examples
	// and marker substrings inside prose must not be interpreted as that request.
	if (content.trim() === DAILY_NOTE_TEMPLATE_MARKER) return renderDailyNote(date);
	const frontmatter = /^(---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$))([\s\S]*)$/.exec(content);
	if (frontmatter && (frontmatter[2]?.trim() === '' || frontmatter[2]?.trim() === DAILY_NOTE_TEMPLATE_MARKER)) {
		return `${frontmatter[1]}\n${renderDailyNote(date)}`;
	}
	return content;
}
