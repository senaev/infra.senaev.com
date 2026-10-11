import {
    describe, expect, it,
} from 'vitest';

import {
    CODE_MCP_TOOL_DEFINITIONS, CODE_TOOL_DEFINITIONS, MANAGED_CODE_TOOL_NAMES,
} from '../codeTools/codeToolDefinitions';

import { OPERATION_TOOL_DEFINITIONS, readOperationArguments } from './operationToolDefinitions';

describe('operation tool contracts', () => {
    it('exposes execution arguments on managed code tools and does not expose modes or wait overrides', () => {
        expect(MANAGED_CODE_TOOL_NAMES).toEqual([
            'projects',
            'run',
            'list',
            'search',
        ]);
        for (const name of MANAGED_CODE_TOOL_NAMES) {
            const { properties } = CODE_TOOL_DEFINITIONS[name].inputSchema;
            const timeout = properties.timeoutSeconds;

            expect(properties).toHaveProperty('requestId');
            expect(properties.executionPolicy).toMatchObject({
                type: 'string',
                enum: [
                    'queued',
                    'parallel',
                ],
            });

            expect(timeout).toMatchObject({
                type: 'integer',
                minimum: 1,
            });
            expect(timeout).not.toHaveProperty('maximum');
            for (const key of [
                'mode',
                'sync',
                'async',
                'waitSeconds',
                'pty',
            ]) {
                expect(properties).not.toHaveProperty(key);
            }
        }

        for (const name of [
            'read',
            'write',
            'patch',
        ] as const) {
            expect(CODE_TOOL_DEFINITIONS[name].inputSchema.properties).not.toHaveProperty('requestId');
        }
    });

    it('publishes the same control definitions with cancellation marked as a mutation', () => {
        expect(CODE_MCP_TOOL_DEFINITIONS.operation_status).toBe(OPERATION_TOOL_DEFINITIONS.operation_status);
        expect(CODE_MCP_TOOL_DEFINITIONS.operation_cancel.annotations.readOnlyHint).toBe(false);
        expect(OPERATION_TOOL_DEFINITIONS.operation_cancel.annotations.idempotentHint).toBe(true);
    });

    it('rejects malformed controls before execution and accepts valid replay offsets', () => {
        expect(readOperationArguments('operations', {})).toEqual({});
        expect(readOperationArguments('operation_result', {
            id: 'code-id',
            cursor: 0,
            offset: 30000,
        }))
            .toEqual({
                id: 'code-id',
                cursor: 0,
                offset: 30000,
            });
        for (const input of [
            {},
            { id: '' },
            { id: 4 },
            {
                id: 'x',
                cursor: null,
            },
            {
                id: 'x',
                cursor: -1,
            },
        ]) {
            expect(() => readOperationArguments('operation_status', input)).toThrow();
        }

        expect(() => readOperationArguments('operation_cancel', {
            id: 'x',
            offset: 0,
        })).toThrow();
        expect(() => readOperationArguments('operations', { id: 'x' })).toThrow();
    });
});
