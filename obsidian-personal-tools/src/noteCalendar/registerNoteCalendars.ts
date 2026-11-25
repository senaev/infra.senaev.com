import { App, MarkdownView, Plugin, TFile, debounce, editorInfoField } from 'obsidian';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { getNoteCalendarKinds } from './calendarProperties';
import { renderNoteCalendars } from './noteCalendarWidget';
import { onTasksCacheUpdate } from './tasksPluginAdapter';

const WIDGET_CLASS = 'senaev-note-calendars';

/** Each refresh bumps this, so the editor widgets that were already drawn are drawn again. */
let revision = 0;

/** Block widget with the calendars of one note, above its content in Live Preview and Source mode. */
class NoteCalendarsWidget extends WidgetType {
	private readonly revision = revision;

	constructor(
		private readonly app: App,
		private readonly file: TFile,
	) {
		super();
	}

	override eq(other: NoteCalendarsWidget): boolean {
		return other.file.path === this.file.path && other.revision === this.revision;
	}

	override toDOM(): HTMLElement {
		const el = activeDocument.createElement('div');
		el.classList.add(WIDGET_CLASS);
		renderNoteCalendars(this.app, el, this.file);

		return el;
	}
}

function buildDecorations(state: EditorState, app: App): DecorationSet {
	const file = state.field(editorInfoField, false)?.file ?? null;

	if (!file || getNoteCalendarKinds(app, file).length === 0) {
		return Decoration.none;
	}

	const builder = new RangeSetBuilder<Decoration>();
	builder.add(0, 0, Decoration.widget({ widget: new NoteCalendarsWidget(app, file), side: -1, block: true }));

	return builder.finish();
}

/**
 * Block decorations must come from a `StateField`, not a `ViewPlugin`. The field is recomputed
 * on every transaction, so a flag typed into the frontmatter is picked up by the next one.
 */
function createEditorExtension(app: App): Extension {
	return StateField.define<DecorationSet>({
		create: (state) => buildDecorations(state, app),
		update: (_value, tr) => buildDecorations(tr.state, app),
		provide: (field) => EditorView.decorations.from(field),
	});
}

/** The CodeMirror view behind an editor; Obsidian does not type it. */
function getEditorView(view: MarkdownView): EditorView | null {
	return (view.editor as unknown as { cm?: EditorView } | undefined)?.cm ?? null;
}

/** Reading view: the calendars are a sibling of the rendered note, so re-rendering the note keeps them. */
function updateReadingView(app: App, view: MarkdownView): void {
	const containerEl = view.previewMode?.containerEl;

	if (!containerEl) {
		return;
	}

	const existing = containerEl.querySelector<HTMLElement>(`:scope > .${WIDGET_CLASS}`);

	if (!view.file || getNoteCalendarKinds(app, view.file).length === 0) {
		existing?.remove();
		return;
	}

	const widget = existing ?? containerEl.createDiv({ cls: WIDGET_CLASS });
	containerEl.prepend(widget);
	renderNoteCalendars(app, widget, view.file);
}

function refreshAll(plugin: Plugin): void {
	revision++;

	for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
		if (!(leaf.view instanceof MarkdownView)) {
			continue;
		}

		updateReadingView(plugin.app, leaf.view);
		// An empty transaction recomputes the field, which draws the widgets again.
		getEditorView(leaf.view)?.dispatch({});
	}
}

/**
 * Shows the reminder and mention calendars at the top of a note whose frontmatter has
 * `reminders-calendar: true` or `mentions-calendar: true`, in both Reading view and Live Preview.
 */
export function registerNoteCalendars(plugin: Plugin): void {
	plugin.registerEditorExtension(createEditorExtension(plugin.app));

	// Reminder and link data change often and a draw is cheap but not free, so batch the events.
	const refresh = debounce(() => refreshAll(plugin), 300, true);
	let unloaded = false;

	// `onLayoutReady` may run its callback after an unload, so it checks first.
	plugin.app.workspace.onLayoutReady(() => {
		if (!unloaded) {
			refresh();
		}
	});
	plugin.registerEvent(plugin.app.workspace.on('file-open', refresh));
	plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', refresh));
	plugin.registerEvent(plugin.app.workspace.on('layout-change', refresh));
	plugin.registerEvent(plugin.app.metadataCache.on('changed', refresh));
	plugin.registerEvent(plugin.app.metadataCache.on('resolved', refresh));
	plugin.registerEvent(onTasksCacheUpdate(plugin.app.workspace, refresh));

	plugin.register(() => {
		unloaded = true;
		// A refresh still waiting in the debounce window would draw the calendars again.
		refresh.cancel();

		for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view instanceof MarkdownView) {
				leaf.view.previewMode?.containerEl
					.querySelectorAll(`:scope > .${WIDGET_CLASS}`)
					.forEach((el) => el.remove());
			}
		}
	});
}
