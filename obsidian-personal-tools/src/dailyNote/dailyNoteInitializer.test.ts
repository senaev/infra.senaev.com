import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDailyNoteInitializer, DailyFile } from './dailyNoteInitializer';
import { DAILY_NOTE_TEMPLATE_MARKER as marker, renderDailyNote } from './dailyNoteTemplate';

function fixture(initial: string, path = 'periodic/day/2026-10-29.md') {
	const file: DailyFile = { path };
	let content = initial;
	let writes = 0;
	let beforeProcess: (() => void) | undefined;
	const initializer = createDailyNoteInitializer({
		read: () => Promise.resolve(content),
		process: (_file, transform) => {
			beforeProcess?.();
			content = transform(content);
			writes++;
			return Promise.resolve(content);
		},
	});
	return { file, initializer, get content() { return content; }, get writes() { return writes; },
		setContent(value: string) { content = value; }, beforeProcess(fn: () => void) { beforeProcess = fn; } };
}

void test('concurrent creation, open and modify events produce one body without a write loop', async () => {
	const f = fixture(marker);
	await Promise.all(Array.from({ length: 10 }, () => f.initializer.initialize(f.file)));
	assert.equal(f.content, renderDailyNote('2026-10-29'));
	assert.equal(f.writes, 1);
	await f.initializer.initialize(f.file);
	assert.equal(f.writes, 1);
});

void test('empty direct/link creation, later marker insertion, rename and synced-file open', async () => {
	for (const input of ['', marker]) {
		const f = fixture(input);
		await f.initializer.initialize(f.file);
		assert.equal(f.content, renderDailyNote('2026-10-29'));
	}
	const f = fixture('', 'periodic/day/Untitled.md');
	await f.initializer.initialize(f.file);
	assert.equal(f.writes, 0);
	f.file.path = 'periodic/day/2026-11-01.md';
	await f.initializer.initialize(f.file);
	assert.equal(f.content, renderDailyNote('2026-11-01'));
	const inserted = fixture('Existing text');
	await inserted.initializer.initialize(inserted.file);
	assert.equal(inserted.writes, 0);
	inserted.setContent(marker);
	await inserted.initializer.initialize(inserted.file);
	assert.equal(inserted.content, renderDailyNote('2026-10-29'));
});

void test('atomic transform preserves user text written after the initial read', async () => {
	const f = fixture('');
	f.beforeProcess(() => f.setContent('Typing started'));
	await f.initializer.initialize(f.file);
	assert.equal(f.content, 'Typing started');
});

void test('unload cancels pending initialization and errors can be retried', async () => {
	const f = fixture('');
	const pending = f.initializer.initialize(f.file);
	f.initializer.dispose();
	await pending;
	await f.initializer.initialize(f.file);
	assert.equal(f.writes, 0);
	let failed = true;
	let content = '';
	const initializer = createDailyNoteInitializer({
		read: () => failed ? Promise.reject(new Error('disk unavailable')) : Promise.resolve(content),
		process: (_file, transform) => Promise.resolve(content = transform(content)),
	});
	await assert.rejects(initializer.initialize(f.file), /disk unavailable/);
	failed = false;
	await initializer.initialize(f.file);
	assert.equal(content, renderDailyNote('2026-10-29'));
});

void test('rechecks a template write delivered while initialization is still in flight', async () => {
	const file = { path: 'periodic/day/2026-10-29.md' };
	let content = '';
	let writes = 0;
	let event: Promise<void> | undefined;
	const initializer = createDailyNoteInitializer({
		read: () => Promise.resolve(content),
		process: (_file, transform) => {
			content = transform(content);
			if (++writes === 1) {
				content = marker;
				event = initializer.initialize(file);
			}
			return Promise.resolve(content);
		},
	});
	await initializer.initialize(file);
	await event;
	assert.equal(writes, 2);
	assert.equal(content, renderDailyNote('2026-10-29'));
});
