import { VAULT_COMMAND_ARGUMENTS, type VaultCommandName } from 'senaev-utils/src/obsidianVaultTools/vaultCommands';
import {
    optionalString, readToolArguments, type ToolArguments,
} from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { parseIsoCalendarDay } from '../milestones/calendarDay';

/** The arguments of a vault tool, which contain only domain fields. */
export function readVaultToolArguments(value: unknown, tool: VaultCommandName): ToolArguments {
    return readToolArguments(value, VAULT_COMMAND_ARGUMENTS[tool]);
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
