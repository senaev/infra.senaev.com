import {
    describe, expect, test,
} from 'vitest';

import { MANAGED_ARGUMENT_KEYS } from '../operations/managedArguments';

import { VAULT_COMMAND_ARGUMENTS } from './vaultCommands';
import {
    getVaultToolArgumentKeys,
    isVaultToolName,
    VAULT_TOOL_DEFINITIONS,
    VAULT_TOOL_NAMES,
} from './vaultToolDefinitions';
import { READ_LIMITS, SEARCH_LIMITS } from './vaultToolLimits';

describe('vault tool definitions', () => {
    test('public schemas match the independent domain and execution contracts', () => {
        for (const [
            name,
            keys,
        ] of Object.entries(VAULT_COMMAND_ARGUMENTS)) {
            const definition = VAULT_TOOL_DEFINITIONS[name as keyof typeof VAULT_TOOL_DEFINITIONS];

            expect(Object.keys(definition.inputSchema.properties).sort()).toEqual([
                ...keys,
                ...MANAGED_ARGUMENT_KEYS,
            ].sort());
        }
    });

    test('lists the tools in a fixed order', () => {
        expect(VAULT_TOOL_NAMES).toEqual([
            'upload',
            'delete',
            'list',
            'search',
            'read',
            'links',
            'create',
            'patch',
            'move',
            'diary_append',
            'tasks_list',
            'tasks_create',
            'tasks_update',
        ]);
    });

    test('accept exactly the keys of the input schema', () => {
        expect(getVaultToolArgumentKeys('diary_append')).toEqual([
            'executionPolicy',
            'timeoutSeconds',
            'requestId',
            'text',
        ]);
        expect(getVaultToolArgumentKeys('list')).toEqual([
            'executionPolicy',
            'timeoutSeconds',
            'requestId',
            'folder',
            'glob',
            'diaryFrom',
            'diaryTo',
            'includeAttachments',
            'recursive',
            'offset',
            'limit',
        ]);
    });

    test('all eight tools expose the common execution contract', () => {
        for (const definition of Object.values(VAULT_TOOL_DEFINITIONS)) {
            expect(definition.inputSchema.properties).toMatchObject({
                executionPolicy: {
                    enum: [
                        'queued',
                        'parallel',
                    ],
                },
                timeoutSeconds: { minimum: 1 },
                requestId: { minLength: 1 },
            });
            expect(definition.description).toContain('obsidian-operation_status');
        }
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
