import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MILESTONE_TYPES, renderMilestoneTemplate } from './milestoneTypes';

const TEMPLATE = '{{FILENAME}} birthday {{AGE}} {{EMOJI}}';

function render(overrides: {
	template?: string;
	fileName?: string;
	age?: number | undefined;
	emoji?: string;
}): string {
	return renderMilestoneTemplate({
		template: overrides.template ?? TEMPLATE,
		fileName: overrides.fileName ?? '@mom',
		age: overrides.age,
		emoji: overrides.emoji ?? '🎉',
	});
}

describe('renderMilestoneTemplate', () => {
	it('fills every placeholder', () => {
		assert.equal(render({ age: 62 }), '@mom birthday (62) 🎉');
	});

	it('leaves no double space when the age is unknown', () => {
		assert.equal(render({ age: undefined }), '@mom birthday 🎉');
	});

	it('collapses whitespace and trims', () => {
		assert.equal(
			render({ template: '  {{FILENAME}}   birthday\t{{AGE}} {{EMOJI}}  ', age: 1 }),
			'@mom birthday (1) 🎉',
		);
	});

	it('renders an unspaced template as written', () => {
		assert.equal(render({ template: '{{FILENAME}}{{EMOJI}}' }), '@mom🎉');
	});

	it('drops a placeholder-only remainder rather than leaving a gap', () => {
		assert.equal(render({ template: '{{FILENAME}} {{AGE}}', age: undefined }), '@mom');
	});

	it('repeats a placeholder used twice', () => {
		assert.equal(
			render({ template: '{{EMOJI}} {{FILENAME}} {{EMOJI}}' }),
			'🎉 @mom 🎉',
		);
	});

	it('leaves an unknown placeholder untouched', () => {
		assert.equal(render({ template: '{{FILENAME}} {{NOPE}}' }), '@mom {{NOPE}}');
	});

	it('inserts a note name containing $ patterns literally', () => {
		// A bare `String.replaceAll` would read `$&` in the replacement as the
		// whole match and produce `{{FILENAME}}`.
		assert.equal(render({ fileName: 'a$&b' }), 'a$&b birthday 🎉');
		assert.equal(render({ fileName: "$'" }), "$' birthday 🎉");
	});

	it('renders age zero, the day a milestone starts', () => {
		assert.equal(render({ age: 0 }), '@mom birthday (0) 🎉');
	});
});

describe('milestone-types.json', () => {
	it('configures the types the vault uses', () => {
		assert.deepEqual(Object.keys(MILESTONE_TYPES), ['birthday', 'holiday', 'death']);
	});

	it('gives every type a non-empty emoji and a {{FILENAME}} template', () => {
		for (const [property, type] of Object.entries(MILESTONE_TYPES)) {
			assert.notEqual(type.emoji, '', `${property} needs an emoji`);
			assert.ok(
				type.template.includes('{{FILENAME}}'),
				`${property} template needs {{FILENAME}} to be linkable`,
			);
		}
	});
});
