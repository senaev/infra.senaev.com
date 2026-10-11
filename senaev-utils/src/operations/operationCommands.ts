import { readToolArguments, requiredNonEmptyString } from '../toolServer/toolArguments';
import { invalidArguments } from '../toolServer/ToolError';

export const OPERATION_COMMAND_ARGUMENTS = {
    operations: [],
    operation_status: [
        'id',
        'cursor',
    ],
    operation_result: [
        'id',
        'cursor',
        'offset',
    ],
    operation_cancel: ['id'],
} as const;

export type OperationToolName = keyof typeof OPERATION_COMMAND_ARGUMENTS;

export function isOperationToolName(name: string): name is OperationToolName {
    return Object.hasOwn(OPERATION_COMMAND_ARGUMENTS, name);
}

/** Validate control arguments before looking up a record or cancelling any work. */
export function readOperationArguments(name: OperationToolName, value: unknown): Record<string, unknown> {
    const args = readToolArguments(value, OPERATION_COMMAND_ARGUMENTS[name]);

    if (name !== 'operations') {
        requiredNonEmptyString(args, 'id');
    }

    for (const key of [
        'cursor',
        'offset',
    ]) {
        const argument = args[key];

        if (argument !== undefined && (typeof argument !== 'number' || !Number.isFinite(argument) || !Number.isInteger(argument) || argument < 0)) {
            throw invalidArguments(`${key} must be a nonnegative integer`);
        }
    }

    return args;
}
