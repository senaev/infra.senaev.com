import {
    createCommandExecution, type Command, type CommandExecution,
} from '../commands/CommandExecution';

export type CommandAdapter<Config, Output = Record<string, unknown>> = (config: Config, input: unknown, execution?: CommandExecution) => Promise<Output>;

/** Validate an untrusted input once, then invoke a typed command with explicit capabilities. */
export function createCommandAdapter<Config, Input, Output>(
    parse: (input: unknown) => Input,
    execute: Command<Config, Input, Output>
): CommandAdapter<Config, Output> {
    return async (config: Config, input: unknown, execution: CommandExecution = createCommandExecution()): Promise<Output> => {
        execution.throwIfAborted();

        return await execute(config, parse(input), execution);
    };
}
