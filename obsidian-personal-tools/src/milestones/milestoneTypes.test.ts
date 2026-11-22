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

void describe('renderMilestoneTemplate', () => {
	void it('fills every placeholder', () => {
		assert.equal(render({ age: 62 }), '@mom birthday (62) 🎉');
	});

	void it('leaves no double space when the age is unknown', () => {
		assert.equal(render({ age: undefined }), '@mom birthday 🎉');
	});

	void it('collapses whitespace and trims', () => {
		assert.equal(
			render({ template: '  {{FILENAME}}   birthday\t{{AGE}} {{EMOJI}}  ', age: 1 }),
			'@mom birthday (1) 🎉',
		);
	});

	void it('renders an unspaced template as written', () => {
		assert.equal(render({ template: '{{FILENAME}}{{EMOJI}}' }), '@mom🎉');
	});

	void it('drops a placeholder-only remainder rather than leaving a gap', () => {
		assert.equal(render({ template: '{{FILENAME}} {{AGE}}', age: undefined }), '@mom');
	});

	void it('repeats a placeholder used twice', () => {
		assert.equal(
			render({ template: '{{EMOJI}} {{FILENAME}} {{EMOJI}}' }),
			'🎉 @mom 🎉',
		);
	});

	void it('leaves an unknown placeholder untouched', () => {
		assert.equal(render({ template: '{{FILENAME}} {{NOPE}}' }), '@mom {{NOPE}}');
	});

	void it('inserts a note name containing $ patterns literally', () => {
		// A bare `String.replaceAll` would read `$&` in the replacement as the
		// whole match and produce `{{FILENAME}}`.
		assert.equal(render({ fileName: 'a$&b' }), 'a$&b birthday 🎉');
		assert.equal(render({ fileName: "$'" }), "$' birthday 🎉");
	});

	void it('renders age zero, the day a milestone starts', () => {
		assert.equal(render({ age: 0 }), '@mom birthday (0) 🎉');
	});
});

void describe('milestones.json', () => {
	void it('configures the types the vault uses, in display order', () => {
		assert.deepEqual(
			MILESTONE_TYPES.map((type) => type.property),
			['birthday', 'holiday', 'death'],
		);
	});

	void it('gives calculated dates to holidays only', () => {
		assert.deepEqual(
			MILESTONE_TYPES.filter((type) => type.ruleProperty !== undefined).map((type) => type.ruleProperty),
			['holiday-rule'],
		);
	});

	void it('gives every type a non-empty emoji and a {{FILENAME}} template', () => {
		for (const { property, ...type } of MILESTONE_TYPES) {
			assert.notEqual(type.emoji, '', `${property} needs an emoji`);
			assert.ok(
				type.template.includes('{{FILENAME}}'),
				`${property} template needs {{FILENAME}} to be linkable`,
			);
		}
	});
});
