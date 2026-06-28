import { addItemsToSupabaseGroceryList } from "./addItemsToSupabaseGroceryList";
import { logger } from "./logger";
import { callOpenRouter } from "./openrouter";
import { insertSupabaseRows } from "./supabase";
import { TrickyDadSource } from "./TrickyDadSource";

export const ALISA_SKILL_NAME = "Умный Папа";

type ParsedAlisaCommand = {
    type: "shopping" | "task" | "error";
    items: string[];
    task: string | null;
    due_date: string | null;
    error: string | null;
};

async function parseAlisaCommandWithOpenRouter(command: string): Promise<ParsedAlisaCommand> {
    const today = new Date().toISOString().slice(0, 10);

    const parsed = await callOpenRouter<ParsedAlisaCommand>({
        messages: [
            {
                role: "system",
                content: [
                    `Today's date is ${today}.`,
                    `## Role`,
                    `You are processing the Yandex Alisa skill named '${ALISA_SKILL_NAME}'.`,
                    "This skill manages two lists: a shopping list and a task list.",
                    "Determine whether the user wants to buy something or to do something.",
                    "## Shopping",
                    "If the user asks to buy, get, or add something to the shopping list, set type to 'shopping'.",
                    "Return the list of items in initial form, preserving details like amount or quantity.",
                    "Each item should start with a capital letter.",
                    "## Tasks",
                    "If the user asks to do, remember, schedule, or add a task, set type to 'task'.",
                    "Return the task description in the task field.",
                    "If the message mentions a due date or deadline, extract it as due_date in YYYY-MM-DD format; otherwise set due_date to null.",
                    "## Errors",
                    "If the command does not clearly match either intent, set type to 'error' and explain briefly in the error field.",
                    "Answer strictly in JSON that matches the provided schema.",
                    "Preserve all text fields in Russian.",
                ].join(" "),
            },
            {
                role: "user",
                content: command,
            },
        ],
        jsonSchema: {
            name: "alisa_command",
            schema: {
                type: "object",
                properties: {
                    type: { type: "string", enum: ["shopping", "task", "error"] },
                    items: { type: "array", items: { type: "string" } },
                    task: { type: ["string", "null"] },
                    due_date: { type: ["string", "null"] },
                    error: { type: ["string", "null"] },
                },
                required: ["type", "items", "task", "due_date", "error"],
                additionalProperties: false,
            },
        },
    });

    if (!Array.isArray(parsed.items)) {
        throw new Error(
            `OpenRouter response items field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    return parsed;
}

export type HandleTrickyDadRequestResult = {
    openRouterResponseTime: number;
    supabaseResponseTime: number | null;
    destination: "grocery" | "task" | "fallback";
    addedItems: string[] | null;
    addedTask: string | null;
    openRouterError: string | null;
    supabaseErrorString: string | null;
};

export async function processAlisaCommand(
    command: string,
    source: TrickyDadSource,
): Promise<HandleTrickyDadRequestResult> {
    const startTime = Date.now();
    let openRouterError: string | null = null;
    logger.info({ command }, "👉 Start processing Alisa command");

    logger.info("👉 Requesting OpenRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    const openRouterResponseTime = Date.now() - startTime;
    logger.info({ command, parsed, openRouterResponseTime }, "✅ Response from OpenRouter");

    const startTimeSupabase = Date.now();
    let supabaseResponseTime = 0;

    if (parsed.type === "shopping" && parsed.items.length > 0) {
        logger.info({ items: parsed.items }, "👉 Adding items to grocery list");
        try {
            await addItemsToSupabaseGroceryList(parsed.items);
            supabaseResponseTime = Date.now() - startTimeSupabase;
        } catch (err) {
            supabaseResponseTime = Date.now() - startTimeSupabase;
            const supabaseErrorString = `❌ Failed to add grocery items: ${err}`;
            logger.error({ err }, "❌ Failed to add items to grocery list");
            return {
                openRouterResponseTime,
                supabaseResponseTime,
                destination: "grocery",
                addedItems: parsed.items,
                addedTask: null,
                openRouterError,
                supabaseErrorString,
            };
        }
        logger.info({ items: parsed.items }, "✅ Added items to grocery list");
        return {
            openRouterResponseTime,
            supabaseResponseTime,
            destination: "grocery",
            addedItems: parsed.items,
            addedTask: null,
            openRouterError,
            supabaseErrorString: null,
        };
    }

    if (parsed.type === "task" && parsed.task) {
        logger.info({ task: parsed.task, due_date: parsed.due_date }, "👉 Adding task");
        try {
            await insertSupabaseRows("tasks", {
                title: `${parsed.task} 🌱 ${source}`,
                ...(parsed.due_date !== null && { due_date: parsed.due_date }),
            });
            supabaseResponseTime = Date.now() - startTimeSupabase;
        } catch (err) {
            supabaseResponseTime = Date.now() - startTimeSupabase;
            const supabaseErrorString = `❌ Failed to add task: ${err}`;
            logger.error({ err }, "❌ Failed to add task");
            return {
                openRouterResponseTime,
                supabaseResponseTime,
                destination: "task",
                addedItems: null,
                addedTask: parsed.task,
                openRouterError,
                supabaseErrorString,
            };
        }
        logger.info({ task: parsed.task }, "✅ Added task");
        return {
            openRouterResponseTime,
            supabaseResponseTime,
            destination: "task",
            addedItems: null,
            addedTask: parsed.task,
            openRouterError,
            supabaseErrorString: null,
        };
    }

    // Fallback: error or unrecognised response — add raw command to grocery list
    if (parsed.type === "error") {
        openRouterError = `❌ OpenRouter: ${parsed.error}`;
        logger.error({ openRouterError }, "❌ OpenRouter classified command as error");
    } else {
        openRouterError = `❌ Unrecognised type or empty result`;
        logger.error({ parsed }, "❌ Unrecognised OpenRouter response");
    }

    logger.info({ command }, "👉 Fallback: adding raw command to grocery list");
    try {
        await addItemsToSupabaseGroceryList([command]);
        supabaseResponseTime = Date.now() - startTimeSupabase;
    } catch (err) {
        supabaseResponseTime = Date.now() - startTimeSupabase;
        const supabaseErrorString = `❌ Failed to add fallback item: ${err}`;
        logger.error({ err }, "❌ Failed to add fallback item");
        return {
            openRouterResponseTime,
            supabaseResponseTime,
            destination: "fallback",
            addedItems: [command],
            addedTask: null,
            openRouterError,
            supabaseErrorString,
        };
    }
    return {
        openRouterResponseTime,
        supabaseResponseTime,
        destination: "fallback",
        addedItems: [command],
        addedTask: null,
        openRouterError,
        supabaseErrorString: null,
    };
}
