import { addItemsToSupabaseGroceryList } from "./addItemsToSupabaseGroceryList";
import { parseAlisaCommandWithOpenRouter } from "./openrouter";

export const ALISA_SKILL_NAME = "Хитрый Батя";

export type HandleTrickyDadRequestResult = {
    openRouterResponseTime: number;
    supabaseResponseTime: number | null;
    errorString: string | null;
};

export async function processAlisaCommand(command: string): Promise<HandleTrickyDadRequestResult> {
    const startTime = Date.now();
    let openRouterResponseTime = 0;
    console.log(`👉 Start processing command=[${command}]`);

    console.log("👉 Request openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    openRouterResponseTime = Date.now() - startTime;
    console.log(
        `✅ Response from openRouter for command=[${command}], parsed=[${JSON.stringify(parsed)}], openRouterResponseTime=[${openRouterResponseTime}ms]`,
    );

    const { items, error } = parsed;

    if (error !== null) {
        const errorString = `❌ Completed with error=[${error}]`;
        console.log();
        return {
            openRouterResponseTime,
            errorString,
            supabaseResponseTime: null,
        };
    }

    if (items.length === 0) {
        const errorString = `❌ Completed with error=[${error}]`;
        console.log(errorString);
        return {
            openRouterResponseTime,
            supabaseResponseTime: null,
            errorString,
        };
    }

    const itemsString = items.join(", ");

    const startTimeSupabase = Date.now();
    let supabaseResponseTime = 0;
    console.log(`👉 Adding items=[${itemsString}] to Supabase`);
    try {
        await addItemsToSupabaseGroceryList(items);
        supabaseResponseTime = Date.now() - startTimeSupabase;
    } catch (err) {
        const errorString = `❌ Failed to add items=[${itemsString}] to Supabase: ${err}`;
        console.error(errorString);
        supabaseResponseTime = Date.now() - startTimeSupabase;

        return {
            openRouterResponseTime,
            supabaseResponseTime,
            errorString,
        };
    }
    console.log(`✅ Successfully added items=[${itemsString}] to Supabase`);

    console.log(
        `✅ Successfully parsed and added list=[${itemsString}] during=[${((Date.now() - startTime) / 1000).toFixed(2)}]s`,
    );
    return {
        openRouterResponseTime,
        supabaseResponseTime,
        errorString: null,
    };
}
