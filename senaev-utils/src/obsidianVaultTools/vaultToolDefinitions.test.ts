import {
    describe, expect, test,
} from 'vitest';

import {
    getVaultToolArgumentKeys,
    isVaultToolName,
    VAULT_TOOL_DEFINITIONS,
    VAULT_TOOL_NAMES,
} from './vaultToolDefinitions';
import { READ_LIMITS, SEARCH_LIMITS } from './vaultToolLimits';

describe('vault tool definitions', () => {
    test('lists the tools in a fixed order', () => {
        expect(VAULT_TOOL_NAMES).toEqual([
            'list',
            'search',
            'read',
            'links',
            'create',
            'patch',
            'diary_append',
        ]);
    });

    test('accept exactly the keys of the input schema', () => {
        expect(getVaultToolArgumentKeys('diary_append')).toEqual(['text']);
        expect(getVaultToolArgumentKeys('list')).toEqual([
            'folder',
            'glob',
            'diaryFrom',
            'diaryTo',
            'recursive',
            'offset',
            'limit',
        ]);
    });

    test('recognise only own tool names, not inherited object keys', () => {
        expect(isVaultToolName('read')).toBe(true);
        expect(isVaultToolName('toString')).toBe(false);
        expect(isVaultToolName('obsidian-read')).toBe(false);
    });

    test('build the schemas and descriptions from the shared limits', () => {
        expect(VAULT_TOOL_DEFINITIONS.search.inputSchema.properties.queries).toMatchObject({ maxItems: SEARCH_LIMITS.maxQueries });
        expect(VAULT_TOOL_DEFINITIONS.search.description).toContain(`Up to ${SEARCH_LIMITS.maxQueries} queries per call`);
        expect(VAULT_TOOL_DEFINITIONS.read.description).toContain('at most 30,000 characters');
        expect(READ_LIMITS.maxCharsPerResponse).toBe(30_000);
    });

    test('end every description with the pointer to the vault rules', () => {
        for (const name of VAULT_TOOL_NAMES) {
            expect(VAULT_TOOL_DEFINITIONS[name].description).toMatch(/read AGENTS\.md with obsidian-read first\.$/);
        }
    });
});
