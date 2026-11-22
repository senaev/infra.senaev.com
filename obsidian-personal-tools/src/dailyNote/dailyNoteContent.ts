import { App } from 'obsidian';
import { renderDailyHeaderWidget } from './dailyHeaderWidget';
import { renderDailyNoteDateHeading } from './dailyNoteDateHeading';
import { renderMilestonesWidget } from './milestonesWidget';

/** Renders the top-of-note content: date heading, nav row, then milestones. */
export function renderDailyNoteHeaderContent(app: App, containerEl: HTMLElement, noteDate: Date): void {
	containerEl.empty();
	renderDailyNoteDateHeading(containerEl, noteDate);
	renderDailyHeaderWidget(app, containerEl.createDiv(), noteDate);
	renderMilestonesWidget(app, containerEl.createDiv(), noteDate);
}

/** Renders the bottom-of-note content: milestones, then nav row (reverse of the header). */
export function renderDailyNoteFooterContent(app: App, containerEl: HTMLElement, noteDate: Date): void {
	containerEl.empty();
	renderMilestonesWidget(app, containerEl.createDiv(), noteDate);
	renderDailyHeaderWidget(app, containerEl.createDiv(), noteDate);
}
