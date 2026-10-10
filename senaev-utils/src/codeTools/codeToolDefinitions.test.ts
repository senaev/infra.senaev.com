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
import { RUN_LIMITS, SEARCH_LIMITS } from './codeToolLimits';

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
        expect(getCodeToolArgumentKeys('projects')).toEqual([]);
        expect(getCodeToolArgumentKeys('run')).toEqual([
            'project',
            'command',
            'timeoutSeconds',
        ]);
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
        expect(CODE_TOOL_DEFINITIONS.run.description).toContain(`at most ${RUN_LIMITS.maxTimeoutSeconds}`);
        expect(CODE_TOOL_DEFINITIONS.read.description).toContain('at most 50,000 characters');
    });
});
