import { App, editorInfoField } from 'obsidian';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { EditorState, Extension, RangeSetBuilder, StateField } from '@codemirror/state';
import { getDailyNoteDate } from './dailyNotePath';
import { renderDailyNoteFooterContent, renderDailyNoteHeaderContent } from './dailyNoteContent';

const WIDGET_CLASS = 'senaev-daily-note-widget';

type WidgetPosition = 'header' | 'footer';

/** Block widget rendering the header or footer content for a given daily note date. */
class DailyNoteWidget extends WidgetType {
	constructor(
		private readonly app: App,
		private readonly noteDate: Date,
		private readonly position: WidgetPosition,
	) {
		super();
	}

	override eq(other: DailyNoteWidget): boolean {
		return other.noteDate.getTime() === this.noteDate.getTime() && other.position === this.position;
	}

	override toDOM(): HTMLElement {
		const el = activeDocument.createElement('div');
		el.classList.add(WIDGET_CLASS);

		if (this.position === 'header') {
			renderDailyNoteHeaderContent(this.app, el, this.noteDate);
		} else {
			renderDailyNoteFooterContent(this.app, el, this.noteDate);
		}

		return el;
	}
}

/** Builds the (at most two) block decorations for the top/bottom widgets. */
function buildDecorations(state: EditorState, app: App): DecorationSet {
	const fileInfo = state.field(editorInfoField, false);
	const noteDate = getDailyNoteDate(fileInfo?.file ?? null);

	if (!noteDate) {
		return Decoration.none;
	}

	const builder = new RangeSetBuilder<Decoration>();
	const docLength = state.doc.length;

	builder.add(
		0,
		0,
		Decoration.widget({ widget: new DailyNoteWidget(app, noteDate, 'header'), side: -1, block: true }),
	);
	builder.add(
		docLength,
		docLength,
		Decoration.widget({ widget: new DailyNoteWidget(app, noteDate, 'footer'), side: 1, block: true }),
	);

	return builder.finish();
}

/**
 * Creates a CodeMirror 6 extension that shows the daily-note header/footer
 * widgets above and below the note content in Live Preview / Source mode,
 * for daily notes only.
 *
 * Block decorations must come from a `StateField` (CodeMirror throws
 * "Block decorations may not be specified via plugins" if provided by a
 * `ViewPlugin`), so the decoration set is recomputed on every state update.
 */
export function createDailyNoteEditorExtension(app: App): Extension {
	const field = StateField.define<DecorationSet>({
		create: (state) => buildDecorations(state, app),
		update: (_value, tr) => buildDecorations(tr.state, app),
		provide: (f) => EditorView.decorations.from(f),
	});

	return field;
}
