import { isObject } from 'senaev-utils/src/types/Object/Object';

import { parseIsoCalendarDay } from '../milestones/calendarDay';

import { invalidArguments } from './VaultToolError';

export type ToolArguments = Record<string, unknown>;

/**
 * The arguments come from ChatGPT through cluster-helper, which does not validate them, so
 * every tool reads them through these helpers. Unknown keys are rejected so that a typo in
 * a field name fails loudly instead of being silently ignored.
 */
export function readToolArguments(value: unknown, allowedKeys: readonly string[]): ToolArguments {
    const args = value ?? {};

    if (!isObject(args) || Array.isArray(args)) {
        throw invalidArguments('Arguments must be a JSON object');
    }

    const unknownKeys = Object.keys(args).filter((key) => !allowedKeys.includes(key));

    if (unknownKeys.length > 0) {
        throw invalidArguments(`Unknown argument(s): ${unknownKeys.join(', ')}. Allowed: ${allowedKeys.join(', ')}`);
    }

    return args;
}

export function optionalString(args: ToolArguments, key: string, maxLength = Infinity): string | undefined {
    const value = args[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw invalidArguments(`"${key}" must be a string`);
    }

    if (value.length > maxLength) {
        throw invalidArguments(`"${key}" must be at most ${maxLength} characters long`);
    }

    return value;
}

export function requiredString(args: ToolArguments, key: string, maxLength = Infinity): string {
    const value = optionalString(args, key, maxLength);

    if (value === undefined) {
        throw invalidArguments(`"${key}" is required`);
    }

    return value;
}

export function requiredNonEmptyString(args: ToolArguments, key: string, maxLength = Infinity): string {
    const value = requiredString(args, key, maxLength);

    if (value === '') {
        throw invalidArguments(`"${key}" must not be empty`);
    }

    return value;
}

export function optionalBoolean(args: ToolArguments, key: string): boolean | undefined {
    const value = args[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'boolean') {
        throw invalidArguments(`"${key}" must be a boolean`);
    }

    return value;
}

export function optionalInteger(
    args: ToolArguments,
    key: string,
    { min, max }: { min: number; max: number }
): number | undefined {
    const value = args[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw invalidArguments(`"${key}" must be an integer from ${min} to ${max}`);
    }

    return value;
}

export function optionalEnum<T extends string>(args: ToolArguments, key: string, values: readonly T[]): T | undefined {
    const value = args[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
        throw invalidArguments(`"${key}" must be one of: ${values.join(', ')}`);
    }

    return value as T;
}

export function optionalStringArray(
    args: ToolArguments,
    key: string,
    { maxItems, maxLength = Infinity }: { maxItems: number; maxLength?: number }
): string[] | undefined {
    const value = args[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
        throw invalidArguments(`"${key}" must be an array of 1 to ${maxItems} strings`);
    }

    return value.map((item, index) => {
        if (typeof item !== 'string' || item === '') {
            throw invalidArguments(`"${key}[${index}]" must be a non-empty string`);
        }

        if (item.length > maxLength) {
            throw invalidArguments(`"${key}[${index}]" must be at most ${maxLength} characters long`);
        }

        return item;
    });
}

/** A strict `YYYY-MM-DD` that is a real day, kept as a string: it compares like a date. */
export function optionalIsoDay(args: ToolArguments, key: string): string | undefined {
    const value = optionalString(args, key);

    if (value === undefined) {
        return undefined;
    }

    if (parseIsoCalendarDay(value) === null) {
        throw invalidArguments(`"${key}" must be a real day in YYYY-MM-DD format`);
    }

    return value;
}

export function optionalObject(args: ToolArguments, key: string): ToolArguments | undefined {
    const value = args[key];

    if (value === undefined || value === null) {
        return undefined;
    }

    if (!isObject(value) || Array.isArray(value)) {
        throw invalidArguments(`"${key}" must be a JSON object`);
    }

    return value;
}
