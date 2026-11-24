import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The recurrence vectors are copied from `obsidian-personal-tools/src/milestones/`.
 * Keep both copies in sync when updating the vectors.
 */
export function readFixture(fileName: 'rule-test-vectors.json'): unknown {
    return JSON.parse(readFileSync(join(__dirname, fileName), 'utf8'));
}
