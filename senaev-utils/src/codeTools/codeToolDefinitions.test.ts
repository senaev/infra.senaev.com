import {
    describe, expect, test,
} from 'vitest';

import {
    CODE_TOOL_DEFINITIONS,
    CODE_TOOL_NAMES,
    getCodeToolArgumentKeys,
    isCodeToolName,
    PROJECT_NAME_PATTERN,
} from './codeToolDefinitions';
import { SEARCH_LIMITS } from './codeToolLimits';

describe('code tool definitions', () => {
    test('lists the tools in a fixed order', () => {
        expect(CODE_TOOL_NAMES).toEqual([
            'projects',
            'clone',
            'list',
            'search',
            'read',
            'write',
            'patch',
            'run',
        ]);
    });

    test('accept exactly the keys of the input schema', () => {
        expect(getCodeToolArgumentKeys('projects')).toEqual([
            'executionPolicy',
            'timeoutSeconds',
            'requestId',
        ]);
        expect(getCodeToolArgumentKeys('run')).toEqual([
            'project',
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

    test('recognise only own tool names, not inherited object keys', () => {
        expect(isCodeToolName('run')).toBe(true);
        expect(isCodeToolName('toString')).toBe(false);
        expect(isCodeToolName('code-run')).toBe(false);
    });

    test('require a project in every tool that works inside one', () => {
        for (const name of CODE_TOOL_NAMES.filter((tool) => tool !== 'projects' && tool !== 'clone')) {
            expect(CODE_TOOL_DEFINITIONS[name].inputSchema.required).toContain('project');
        }
    });

    test('allow only plain folder names as project names', () => {
        const pattern = new RegExp(PROJECT_NAME_PATTERN);

        expect(pattern.test('infra.senaev.com')).toBe(true);
        expect(pattern.test('my_repo-2')).toBe(true);
        expect(pattern.test('.git')).toBe(false);
        expect(pattern.test('..')).toBe(false);
        expect(pattern.test('a/b')).toBe(false);
        expect(pattern.test('')).toBe(false);
    });

    test('build the schemas and descriptions from the shared limits', () => {
        expect(CODE_TOOL_DEFINITIONS.search.inputSchema.properties.queries).toMatchObject({ maxItems: SEARCH_LIMITS.maxQueries });
        expect(CODE_TOOL_DEFINITIONS.run.description).toContain('it has no API maximum');
        expect(CODE_TOOL_DEFINITIONS.run.inputSchema.properties.timeoutSeconds).not.toHaveProperty('maximum');
        expect(CODE_TOOL_DEFINITIONS.read.description).toContain('at most 50,000 characters');
    });
});
