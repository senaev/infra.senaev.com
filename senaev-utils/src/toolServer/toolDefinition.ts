/** An MCP tool as ChatGPT sees it in `tools/list`, without its name. */
export type ToolDefinition = {
    title: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: readonly string[];
        additionalProperties: false;
    };
    annotations: {
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
    };
};

export const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

export function formatNumber(value: number): string {
    return value.toLocaleString('en-US');
}

export function pagingProperties(
    {
        defaultLimit, maxLimit, maxOffset,
    }: { defaultLimit: number; maxLimit: number; maxOffset: number },
    { items, offsetDescription }: { items: string; offsetDescription?: string }
) {
    return {
        offset: {
            type: 'integer',
            minimum: 0,
            maximum: maxOffset,
            ...offsetDescription !== undefined && { description: offsetDescription },
        },
        limit: {
            type: 'integer',
            minimum: 1,
            maximum: maxLimit,
            description: `${items} per page. Default: ${defaultLimit}. A larger value is reduced to ${maxLimit}.`,
        },
    };
}

/** The argument keys a tool accepts: exactly the properties of its input schema. */
export function getToolArgumentKeys(definition: ToolDefinition): string[] {
    return Object.keys(definition.inputSchema.properties);
}
