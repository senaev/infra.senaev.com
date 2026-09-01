import { App } from 'obsidian';
import { getDailyNoteMilestones } from './milestones';
import { attachInternalLink } from './internalLink';

/**
 * Renders the milestones widget (today's/tomorrow's birthdays & holidays,
 * or a "no events" placeholder) for `noteDate` into `containerEl`.
 *
 * `containerEl` is cleared and repopulated on every call, so it's safe to
 * call this repeatedly to refresh an already-mounted widget.
 */
export function renderMilestonesWidget(app: App, containerEl: HTMLElement, noteDate: Date): void {
	containerEl.empty();

	const milestones = getDailyNoteMilestones(app, noteDate);

	if (milestones.length === 0) {
		containerEl.createSpan({ text: '🤷‍♂️ no events' });
		return;
	}

	milestones.forEach((milestone, index) => {
		if (index > 0) {
			containerEl.createEl('br');
		}

		const link = containerEl.createEl('a', { cls: 'internal-link', text: milestone.text });
		attachInternalLink(app, link, milestone.path);
	});
}
