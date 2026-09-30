import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The JSON files here are copies from the senaev-personal-tools Obsidian plugin
 * (`plugins/senaev-personal-tools/src/milestones/` in the vault). Copy them again when the
 * plugin changes them, so both implementations are tested against the same data.
 */
export function readFixture(fileName: 'milestones.json' | 'rule-test-vectors.json'): unknown {
    return JSON.parse(readFileSync(join(__dirname, fileName), 'utf8'));
}
