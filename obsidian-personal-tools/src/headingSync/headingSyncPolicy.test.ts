import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filenameFromHeading, targetPath } from './headingSyncPolicy';

void test('keeps Unicode and removes upstream forbidden filename characters', () => {
	assert.equal(filenameFromHeading('  C# / [Привет] ^: | \\ 😀  '), 'C  Привет    😀');
	assert.equal(targetPath('notes/Old.md', 'C#'), 'notes/C.md');
	assert.equal(targetPath('Old.md', 'Новый 😀'), 'Новый 😀.md');
});

void test('preserves intended folder and filename exclusions', () => {
	for (const path of ['_prompts/p.md', 'public/senaev_speaks/p.md', '_templates/p.md', '_template.md', 'periodic/day/p.md', '@senaev/daily_note_draft.md', '@senaev/tasks/tasks_stream.md', 'short_links.md', 'nested/periodic/p.md']) {
		assert.equal(targetPath(path, 'New'), null, path);
	}
	for (const path of ['notes/p.md', 'not_periodic/p.md', 'periodical/p.md', 'notes/my_template.md', 'notes/daily_note_draft.md.backup.md', 'notes_stream/p.md', 'short_links_folder/p.md']) {
		assert.equal(targetPath(path, 'New'), path.slice(0, path.lastIndexOf('/') + 1) + 'New.md', path);
	}
	assert.equal(targetPath('nested/_templates/p.md', 'New'), null);
	assert.equal(targetPath('nested/public/senaev_speaks/p.md', 'New'), null);
});

void test('ignores missing, empty, unchanged, and unsafe names', () => {
	for (const heading of ['', '  ', '#/:[]^|', '.', '..', 'Old']) {
		assert.equal(targetPath('Old.md', heading), null);
	}
	assert.equal(targetPath('image.png', 'New'), null);
});
