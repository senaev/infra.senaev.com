import {
    describe, expect, test,
} from 'vitest';

import { MANAGED_ARGUMENT_KEYS } from '../operations/managedArguments';

import { CODE_COMMAND_ARGUMENTS } from './codeCommands';
import {
    CODE_TOOL_DEFINITIONS,
    CODE_TOOL_NAMES,
    getCodeToolArgumentKeys,
    isCodeToolName,
    ABSOLUTE_PATH_PATTERN,
    SERVER_RULES,
} from './codeToolDefinitions';
import { SEARCH_LIMITS } from './codeToolLimits';

describe('code tool definitions', () => {
    test('public schemas match the independent domain and execution contracts', () => {
        for (const [
            name,
            keys,
        ] of Object.entries(CODE_COMMAND_ARGUMENTS)) {
            const definition = CODE_TOOL_DEFINITIONS[name as keyof typeof CODE_TOOL_DEFINITIONS];

            expect(Object.keys(definition.inputSchema.properties).sort()).toEqual([
                ...keys,
                ...MANAGED_ARGUMENT_KEYS,
            ].sort());
        }
    });

    test('lists the tools in a fixed order', () => {
        expect(CODE_TOOL_NAMES).toEqual([
            'list',
            'search',
            'read',
            'write',
            'patch',
            'run',
        ]);
    });

    test('accept exactly the keys of the input schema', () => {
        expect(getCodeToolArgumentKeys('run')).toEqual([
            'cwd',
            'command',
            'executionPolicy',
            'timeoutSeconds',
            'requestId',
        ]);
    });

    test('every domain command exposes the same managed execution contract', () => {
        for (const name of CODE_TOOL_NAMES) {
            const { properties } = CODE_TOOL_DEFINITIONS[name].inputSchema;

            expect(properties.executionPolicy).toMatchObject({
                enum: [
                    'queued',
                    'parallel',
                ],
            });
            expect(properties.timeoutSeconds).toMatchObject({ minimum: 1 });
            expect(properties.timeoutSeconds).not.toHaveProperty('maximum');
            expect(properties.requestId).toBeDefined();
            expect(CODE_TOOL_DEFINITIONS[name].description).toContain('observes for up to 5 seconds');
        }
    });

    test('every tool points to the server rules in /AGENTS.md', () => {
        for (const name of CODE_TOOL_NAMES) {
            expect(CODE_TOOL_DEFINITIONS[name].description).toContain(SERVER_RULES);
        }
    });

    test('recognise only own tool names, not inherited object keys', () => {
        expect(isCodeToolName('run')).toBe(true);
        expect(isCodeToolName('toString')).toBe(false);
        expect(isCodeToolName('code-run')).toBe(false);
    });

    test('require an absolute location in every tool', () => {
        const locations = {
            list: 'folder',
            search: 'folder',
            read: 'paths',
            write: 'path',
            patch: 'path',
            run: 'cwd',
        } as const;

        for (const name of CODE_TOOL_NAMES) {
            const { inputSchema } = CODE_TOOL_DEFINITIONS[name];
            const property: unknown = inputSchema.properties[locations[name]];

            expect(inputSchema.required).toContain(locations[name]);
            expect(JSON.stringify(property)).toContain(`"pattern":"${ABSOLUTE_PATH_PATTERN}"`);
        }
    });

    test('accept only absolute paths', () => {
        const pattern = new RegExp(ABSOLUTE_PATH_PATTERN);

        expect(pattern.test('/code/projects/infra.senaev.com')).toBe(true);
        expect(pattern.test('/')).toBe(true);
        expect(pattern.test('src/index.ts')).toBe(false);
        expect(pattern.test('')).toBe(false);
    });

    test('build the schemas and descriptions from the shared limits', () => {
        expect(CODE_TOOL_DEFINITIONS.search.inputSchema.properties.queries).toMatchObject({ maxItems: SEARCH_LIMITS.maxQueries });
        expect(CODE_TOOL_DEFINITIONS.run.description).toContain('it has no API maximum');
        expect(CODE_TOOL_DEFINITIONS.run.inputSchema.properties.timeoutSeconds).not.toHaveProperty('maximum');
        expect(CODE_TOOL_DEFINITIONS.read.description).toContain('at most 50,000 characters');
    });
});
