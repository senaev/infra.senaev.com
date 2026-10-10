import { getVaultToolArgumentKeys, type VaultToolName } from 'senaev-utils/src/obsidianVaultTools/vaultToolDefinitions';
import {
    optionalString, readToolArguments, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/toolServer/ToolError';

import { parseIsoCalendarDay } from '../milestones/calendarDay';

/** The arguments of a vault tool, which may use exactly the keys of its shared input schema. */
export function readVaultToolArguments(value: unknown, tool: VaultToolName): ToolArguments {
    return readToolArguments(value, getVaultToolArgumentKeys(tool));
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
