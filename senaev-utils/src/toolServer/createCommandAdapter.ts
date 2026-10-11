import type { Command, CommandExecution } from '../commands/CommandExecution';
import { currentCommandExecution } from '../operations/operationContext';

/** Validate an untrusted input once, then invoke a typed command with explicit capabilities. */
export function createCommandAdapter<Config, Input, Output>(
    parse: (input: unknown) => Input,
    execute: Command<Config, Input, Output>
) {
    return async (config: Config, input: unknown, execution: CommandExecution = currentCommandExecution()): Promise<Output> => {
        execution.throwIfAborted();

        return await execute(config, parse(input), execution);
    };
}
