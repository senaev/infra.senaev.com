import { addItemsToSupabaseGroceryList } from "./addItemsToSupabaseGroceryList";
import { logger } from "./logger";
import { callOpenRouter } from "./openrouter";

export const ALISA_SKILL_NAME = "Умный Папа";

type ParsedAlisaCommand = {
    items: string[];
    error: string | null;
};

async function parseAlisaCommandWithOpenRouter(command: string): Promise<ParsedAlisaCommand> {
    const parsed = await callOpenRouter<ParsedAlisaCommand>({
        messages: [
            {
                role: "system",
                content: [
                    `## Command`,
                    `You are processing the Yandex Alisa skill named '${ALISA_SKILL_NAME}'.`,
                    "This skill is dedicated to managing a single shopping list.",
                    "If the user asks to add something to the shopping list, return only the list of items to add.",
                    "All the items in the response should be in initial form, but avoid losing details like amount, quantity or anything else.",
                    "All the items in the response should start from capital letter, as they will be directly added to the shopping list.",
                    "Answer strictly in JSON that matches the provided schema.",
                    "Preserve item names and error message in Russian.",
                    "## Errors",
                    "If the user asks for anything else, return an error and short explanation.",
                ].join(" "),
            },
            {
                role: "user",
                content: command,
            },
        ],
        jsonSchema: {
            name: "alisa_shopping_command",
            schema: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: { type: "string" },
                    },
                    error: {
                        type: ["string", "null"],
                    },
                },
                required: ["items", "error"],
                additionalProperties: false,
            },
        },
    });

    if (!Array.isArray(parsed.items)) {
        throw new Error(
            `OpenRouter response items field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    if (parsed.error !== null && typeof parsed.error !== "string") {
        throw new Error(
            `OpenRouter response error field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    return parsed;
}

export type HandleTrickyDadRequestResult = {
    openRouterResponseTime: number;
    supabaseResponseTime: number | null;
    addedItems: string[] | null;
    openRouterError: string | null;
    supabaseErrorString: string | null;
};

export async function processAlisaCommand(command: string): Promise<HandleTrickyDadRequestResult> {
    const startTime = Date.now();
    let openRouterResponseTime = 0;
    let openRouterError: string | null = null;
    logger.info({ command }, "👉 Start processing Alisa command");

    logger.info("👉 Requesting openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    openRouterResponseTime = Date.now() - startTime;
    logger.info({ command, parsed, openRouterResponseTime }, "✅ Response from openRouter");

    const { items, error } = parsed;
    let addedItems: string[] = items ?? [];

    if (error !== null) {
        openRouterError = `❌ Open router request completed with error=[${error}]`;
        logger.error({ openRouterError }, "❌ OpenRouter request completed with error");

        addedItems = [command];
    }

    if (items.length === 0) {
        openRouterError = `❌ Open router request responded with no items`;
        logger.error("❌ OpenRouter request responded with no items");

        addedItems = [command];
    }

    const itemsString = items.join(", ");

    const startTimeSupabase = Date.now();
    let supabaseResponseTime = 0;
    logger.info({ items: itemsString }, "👉 Adding items to Supabase");
    try {
        await addItemsToSupabaseGroceryList(addedItems);
        supabaseResponseTime = Date.now() - startTimeSupabase;
    } catch (err) {
        const supabaseErrorString = `❌ Failed to add items=[${itemsString}] to Supabase: ${err}`;
        logger.error({ err, items: itemsString }, "❌ Failed to add items to Supabase");
        supabaseResponseTime = Date.now() - startTimeSupabase;

        return {
            openRouterResponseTime,
            supabaseResponseTime,
            openRouterError,
            supabaseErrorString,
            addedItems,
        };
    }
    logger.info({ items: itemsString }, "✅ Successfully added items to Supabase");

    logger.info(
        { items: itemsString, durationSec: ((Date.now() - startTime) / 1000).toFixed(2) },
        "✅ Successfully parsed and added list",
    );
    return {
        openRouterResponseTime,
        supabaseResponseTime,
        openRouterError,
        supabaseErrorString: null,
        addedItems,
    };
}
