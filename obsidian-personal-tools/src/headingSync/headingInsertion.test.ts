import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingFromFilename, insertHeading } from './headingInsertion';

void test('uses the basename as the heading, except for untitled notes', () => {
	assert.equal(headingFromFilename('Server galkin.senaev.com'), 'Server galkin.senaev.com');
	assert.equal(headingFromFilename('  Note  '), 'Note');
	for (const name of ['', '  ', 'Untitled', 'Untitled 3']) {
		assert.equal(headingFromFilename(name), null, name);
	}
	assert.equal(headingFromFilename('Untitled plan'), 'Untitled plan');
});

void test('inserts the heading at the top with one blank line after it', () => {
	assert.equal(insertHeading('Text\n', 'Note'), '# Note\n\nText\n');
	assert.equal(insertHeading('\nText', 'Note'), '# Note\n\nText');
	assert.equal(insertHeading('Text\r\nMore', 'Note'), '# Note\r\n\r\nText\r\nMore');
});

void test('inserts the heading after the frontmatter', () => {
	assert.equal(insertHeading('---\ntags: [a]\n---\nText', 'Note'), '---\ntags: [a]\n---\n# Note\n\nText');
	assert.equal(insertHeading('---\na: 1\n---\n\nText', 'Note'), '---\na: 1\n---\n# Note\n\nText');
});

void test('leaves notes with an empty body unchanged', () => {
	for (const content of ['', ' \n\n', '---\na: 1\n---', '---\na: 1\n---\n\n']) {
		assert.equal(insertHeading(content, 'Note'), null, JSON.stringify(content));
	}
});

void test('leaves a frontmatter block that cannot be split unchanged', () => {
	for (const content of ['---\na: 1\nText', '---\r\na: 1\r\n---\r\nText', '---\nText']) {
		assert.equal(insertHeading(content, 'Note'), null, JSON.stringify(content));
	}
});
