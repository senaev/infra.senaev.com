import type { Logger } from 'pino';

import { domainArguments, MANAGED_ARGUMENT_KEYS } from '../operations/managedArguments';
import { OperationManager } from '../operations/OperationManager';
import { isOperationToolName, readOperationArguments } from '../operations/operationCommands';

import { readToolArguments } from './toolArguments';
import { ToolError } from './ToolError';

/** Backend adapter shared by HTTP services, independent of MCP and ChatGPT. */
export function createManagedToolService<Name extends string, Config>(options: {
    backend: string;
    logger: Pick<Logger, 'error'>;
    tools: Record<Name, (config: Config, input: unknown) => Promise<Record<string, unknown>>>;
    config: Config;
    argumentKeys: (name: Name) => readonly string[];
}) {
    const manager = new OperationManager(options.backend, (error, operation) => {
        options.logger.error({
            err: error,
            ...operation,
        }, 'Managed operation crashed');
    });

    return {
        close: () => manager.close(),
        call: (name: string, input: unknown) => {
            if (isOperationToolName(name)) {
                return manager.control(name, readOperationArguments(name, input));
            }

            if (!Object.hasOwn(options.tools, name)) {
                throw new ToolError('unknown_tool', `Unknown ${options.backend} tool "${name}"`);
            }

            const tool = name as Name;
            const args = readToolArguments(input, [
                ...options.argumentKeys(tool),
                ...MANAGED_ARGUMENT_KEYS,
            ]);
            const inputArgs = domainArguments(args);

            return manager.launch({
                tool,
                args,
                run: () => options.tools[tool](options.config, inputArgs),
            });
        },
    };
}
