import { CODE_COMMAND_ARGUMENTS, type CodeCommandName } from 'senaev-utils/src/codeTools/codeCommands';
import { readToolArguments, type ToolArguments } from 'senaev-utils/src/toolServer/toolArguments';

/** The arguments of a code tool, which contain only domain fields. */
export function readCodeToolArguments(value: unknown, tool: CodeCommandName): ToolArguments {
    return readToolArguments(value, CODE_COMMAND_ARGUMENTS[tool]);
}
