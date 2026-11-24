import { MarkdownView, Plugin } from 'obsidian';
import { getDailyNoteDate } from './dailyNotePath';
import { renderDailyNoteFooterContent, renderDailyNoteHeaderContent } from './dailyNoteContent';
import { createDailyNoteEditorExtension } from './dailyNoteEditorExtension';

const HEADER_CLASS = 'senaev-daily-note-header';
const FOOTER_CLASS = 'senaev-daily-note-footer';

/**
 * Injects/refreshes/removes the Reading-mode header & footer for a single
 * `MarkdownView`, based on whether it's currently showing a daily note.
 *
 * The widgets are attached directly to `view.previewMode.containerEl`
 * (rather than through a Markdown post-processor), so they exist as
 * siblings of the rendered note content and survive Obsidian re-rendering
 * that content whenever the file changes.
 */
function updateReadingViewWidgets(view: MarkdownView): void {
	const containerEl = view.previewMode?.containerEl;
	if (!containerEl) {
		return;
	}

	const noteDate = getDailyNoteDate(view.file);

	const existingHeader = containerEl.querySelector<HTMLElement>(`:scope > .${HEADER_CLASS}`);
	const existingFooter = containerEl.querySelector<HTMLElement>(`:scope > .${FOOTER_CLASS}`);

	if (!noteDate) {
		existingHeader?.remove();
		existingFooter?.remove();
		return;
	}

	const header = existingHeader ?? containerEl.createDiv({ cls: HEADER_CLASS });
	containerEl.prepend(header);
	renderDailyNoteHeaderContent(view.app, header, noteDate);

	const footer = existingFooter ?? containerEl.createDiv({ cls: FOOTER_CLASS });
	containerEl.appendChild(footer);
	renderDailyNoteFooterContent(view.app, footer, noteDate);
}

/** Runs `updateReadingViewWidgets` for every currently open Markdown view. */
function refreshAllReadingViews(plugin: Plugin): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
		if (leaf.view instanceof MarkdownView) {
			updateReadingViewWidgets(leaf.view);
		}
	}
}

/**
 * Registers everything needed to show the daily-note header (nav row +
 * milestones) and footer (milestones + nav row) at the top and bottom of
 * daily notes, in both Reading view and Live Preview/Source mode, without
 * requiring any content to be present in the note itself.
 */
export function registerDailyNoteWidgets(plugin: Plugin): void {
	// Live Preview / Source mode: rendered via CodeMirror block widgets.
	plugin.registerEditorExtension(createDailyNoteEditorExtension(plugin.app));

	// Reading mode: rendered as DOM siblings of the rendered note content.
	plugin.app.workspace.onLayoutReady(() => refreshAllReadingViews(plugin));

	plugin.registerEvent(plugin.app.workspace.on('file-open', () => refreshAllReadingViews(plugin)));
	plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', () => refreshAllReadingViews(plugin)));
	plugin.registerEvent(plugin.app.workspace.on('layout-change', () => refreshAllReadingViews(plugin)));

	// Other notes' frontmatter/reminders can change while a daily note stays
	// open, so keep Reading-mode widgets in sync too.
	plugin.registerEvent(plugin.app.metadataCache.on('changed', () => refreshAllReadingViews(plugin)));

	plugin.register(() => {
		for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
			if (!(leaf.view instanceof MarkdownView)) {
				continue;
			}

			leaf.view.previewMode?.containerEl
				.querySelectorAll(`:scope > .${HEADER_CLASS}, :scope > .${FOOTER_CLASS}`)
				.forEach((el) => el.remove());
		}
	});
}
