import { addItemsToSupabaseGroceryList } from "./addItemsToSupabaseGroceryList";
import { logger } from "./logger";
import { addObsidianTasks } from "./obsidianSyncApi";
import { callOpenRouter } from "./openrouter";
import { TrickyDadSource } from "./TrickyDadSource";

export const ALISA_SKILL_NAME = "Умный Папа";

type ParsedTask = {
    title: string;
    due_date: string | null;
};

type ParsedAlisaCommand = {
    type: "shopping" | "task" | "error";
    items: string[];
    tasks: ParsedTask[];
    error: string | null;
};

const PARSED_TASK_JSON_SCHEMA = {
    type: "object",
    properties: {
        title: { type: "string" },
        due_date: { type: ["string", "null"] },
    },
    required: ["title", "due_date"],
    additionalProperties: false,
} as const;

// The model is free to return several tasks, so every task field must be an
// array. A single task is just an array of length one — there is no separate
// shape for it.
const TASKS_PROMPT_LINES = [
    "A single message may contain several tasks — return every one of them as a separate entry in the tasks array.",
    "Split a message into several tasks only when it really describes separate actions; do not split one action into pieces.",
    "Keep the wording of each task as close to the original message as possible — do not rephrase or rewrite unless necessary.",
    "If a task mentions a due date or deadline, extract it as that task's due_date in YYYY-MM-DD format; otherwise set its due_date to null.",
    "A due date that clearly applies to the whole message applies to every task in it.",
];

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
                    ...TASKS_PROMPT_LINES,
                    "## Errors",
                    "If the command does not clearly match either intent, set type to 'error' and explain briefly in the error field.",
                    "Answer strictly in JSON that matches the provided schema.",
                    "Preserve the language of the original request in all text fields.",
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
                    tasks: { type: "array", items: PARSED_TASK_JSON_SCHEMA },
                    error: { type: ["string", "null"] },
                },
                required: ["type", "items", "tasks", "error"],
                additionalProperties: false,
            },
        },
    });

    if (!Array.isArray(parsed.items)) {
        throw new Error(
            `OpenRouter response items field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    if (!Array.isArray(parsed.tasks)) {
        throw new Error(
            `OpenRouter response tasks field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    return parsed;
}

// Dedicated parser for the Obsidian Tasks chat. Its schema has no shopping concept at
// all — the model is only ever asked to extract a task, so it has no way to route a
// message anywhere else. Which prompt/function runs for a given message is decided in
// code (see processAlisaCommand below), never by the model itself.
type ParsedTaskOnlyCommand = {
    tasks: ParsedTask[];
};

async function parseTaskOnlyCommandWithOpenRouter(command: string): Promise<ParsedTaskOnlyCommand> {
    const today = new Date().toISOString().slice(0, 10);

    const parsed = await callOpenRouter<ParsedTaskOnlyCommand>({
        messages: [
            {
                role: "system",
                content: [
                    `Today's date is ${today}.`,
                    `## Role`,
                    `You are extracting tasks from a message sent to the Yandex Alisa skill named '${ALISA_SKILL_NAME}'.`,
                    "## Tasks",
                    "Copy the message into the task title as-is, only making the minimal changes needed to form a valid task description. Do not rephrase or rewrite.",
                    ...TASKS_PROMPT_LINES,
                    "Never return an empty tasks array — if the message describes a single action, return exactly one task.",
                    "Answer strictly in JSON that matches the provided schema.",
                    "Preserve the language of the original request in all text fields.",
                ].join(" "),
            },
            {
                role: "user",
                content: command,
            },
        ],
        jsonSchema: {
            name: "task_only_command",
            schema: {
                type: "object",
                properties: {
                    tasks: { type: "array", items: PARSED_TASK_JSON_SCHEMA },
                },
                required: ["tasks"],
                additionalProperties: false,
            },
        },
    });

    if (!Array.isArray(parsed.tasks)) {
        throw new Error(
            `OpenRouter response tasks field is invalid [${JSON.stringify(parsed, null, 2)}]`,
        );
    }

    return parsed;
}

export type HandleTrickyDadRequestResult = {
    openRouterResponseTime: number;
    /** Time spent on the downstream write — Supabase for grocery items, obsidian-sync for tasks. */
    writeResponseTime: number | null;
    destination: "grocery" | "task" | "fallback";
    addedItems: string[] | null;
    addedTasks: string[] | null;
    openRouterError: string | null;
    /** Error from the downstream write — Supabase for grocery items, obsidian-sync for tasks. */
    writeErrorString: string | null;
};

/**
 * Times an OpenRouter call so both command flows report `openRouterResponseTime`
 * the same way.
 */
async function parseWithTiming<T>(
    command: string,
    parse: (command: string) => Promise<T>,
): Promise<{ parsed: T; openRouterResponseTime: number }> {
    const startTime = Date.now();

    logger.info("👉 Requesting OpenRouter");
    const parsed = await parse(command);
    const openRouterResponseTime = Date.now() - startTime;
    logger.info({ command, parsed, openRouterResponseTime }, "✅ Response from OpenRouter");

    return { parsed, openRouterResponseTime };
}

/**
 * Runs a downstream write, timing it and turning a failure into a
 * `writeErrorString`. The error must not escape: a failed write is still
 * reported to the user, exactly like a successful one.
 */
async function runWrite(
    action: string,
    write: () => Promise<void>,
): Promise<Pick<HandleTrickyDadRequestResult, "writeResponseTime" | "writeErrorString">> {
    const startTime = Date.now();

    try {
        await write();
        logger.info(`✅ Finished: ${action}`);
        return { writeResponseTime: Date.now() - startTime, writeErrorString: null };
    } catch (err) {
        logger.error({ err }, `❌ Failed to ${action}`);
        return {
            writeResponseTime: Date.now() - startTime,
            writeErrorString: `❌ Failed to ${action}: ${err}`,
        };
    }
}

/** Writes grocery items to Supabase and builds the report result for them. */
async function writeGroceryItems({
    items,
    // `grocery` is a real shopping intent; `fallback` is an unclassified command
    // dumped into the same list, so the write is identical but the report is not.
    destination,
    openRouterResponseTime,
    openRouterError,
}: {
    items: string[];
    destination: "grocery" | "fallback";
    openRouterResponseTime: number;
    openRouterError: string | null;
}): Promise<HandleTrickyDadRequestResult> {
    logger.info({ items, destination }, "👉 Adding items to grocery list");

    return {
        openRouterResponseTime,
        ...(await runWrite("add grocery items", () => addItemsToSupabaseGroceryList(items))),
        destination,
        addedItems: items,
        addedTasks: null,
        openRouterError,
    };
}

/** Writes tasks to the Obsidian vault and builds the report result for them. */
async function writeTasks({
    tasks,
    source,
    openRouterResponseTime,
    openRouterError,
}: {
    tasks: ParsedTask[];
    source: TrickyDadSource;
    openRouterResponseTime: number;
    openRouterError: string | null;
}): Promise<HandleTrickyDadRequestResult> {
    logger.info({ tasks }, "👉 Adding tasks");

    return {
        openRouterResponseTime,
        ...(await runWrite("add tasks", () =>
            addObsidianTasks(
                tasks.map(({ title, due_date }) => ({
                    title: `${title} 🌱 ${source}`,
                    due_date,
                })),
            ),
        )),
        destination: "task",
        addedItems: null,
        addedTasks: tasks.map(({ title }) => title),
        openRouterError,
    };
}

// Used for the Tricky Dad chat and the Alisa voice skill only: these sources may
// legitimately mean either the shopping list or the task list, so the model classifies
// each command. The Obsidian Tasks chat never reaches this function — see
// processAlisaCommand below, which routes it to processObsidianTaskCommand instead.
async function processShoppingOrTaskCommand(
    command: string,
    source: TrickyDadSource,
): Promise<HandleTrickyDadRequestResult> {
    logger.info({ command }, "👉 Start processing Alisa command");

    const { parsed, openRouterResponseTime } = await parseWithTiming(
        command,
        parseAlisaCommandWithOpenRouter,
    );

    if (parsed.type === "shopping" && parsed.items.length > 0) {
        return writeGroceryItems({
            items: parsed.items,
            destination: "grocery",
            openRouterResponseTime,
            openRouterError: null,
        });
    }

    if (parsed.type === "task" && parsed.tasks.length > 0) {
        return writeTasks({
            tasks: parsed.tasks,
            source,
            openRouterResponseTime,
            openRouterError: null,
        });
    }

    // Fallback: error or unrecognised response — add the raw command to the grocery list
    // so nothing is ever lost, and report why classification failed.
    const openRouterError =
        parsed.type === "error"
            ? `❌ OpenRouter: ${parsed.error}`
            : `❌ Unrecognised type or empty result`;
    logger.error({ parsed, openRouterError }, "❌ Cannot classify command, falling back");

    return writeGroceryItems({
        items: [command],
        destination: "fallback",
        openRouterResponseTime,
        openRouterError,
    });
}

// Used for the Obsidian Tasks chat only. It is a task-only source, so this always writes
// to the Obsidian vault and never touches the shopping list — there is no branch here that
// could send it anywhere else, and parseTaskOnlyCommandWithOpenRouter's schema has no
// shopping concept for a model to pick either.
async function processObsidianTaskCommand(
    command: string,
    source: TrickyDadSource,
): Promise<HandleTrickyDadRequestResult> {
    logger.info({ command, source }, "👉 Start processing Alisa command (task-only)");

    const { parsed, openRouterResponseTime } = await parseWithTiming(
        command,
        parseTaskOnlyCommandWithOpenRouter,
    );

    return writeTasks({
        // This chat is task-only, so an empty model response must still produce a task:
        // fall back to the raw message rather than silently dropping it.
        tasks: parsed.tasks.length > 0 ? parsed.tasks : [{ title: command, due_date: null }],
        source,
        openRouterResponseTime,
        openRouterError: null,
    });
}

export async function processAlisaCommand(
    command: string,
    source: TrickyDadSource,
): Promise<HandleTrickyDadRequestResult> {
    // Code-level routing rule, not a model decision: the Obsidian Tasks chat is
    // task-only and must never write to the shopping list.
    if (source === "Obsidian Tasks") {
        return processObsidianTaskCommand(command, source);
    }

    return processShoppingOrTaskCommand(command, source);
}
