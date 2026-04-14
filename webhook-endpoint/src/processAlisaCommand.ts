import { addItemsToSupabaseGroceryList } from "./addItemsToSupabaseGroceryList";
import { parseAlisaCommandWithOpenRouter } from "./openrouter";

export const ALISA_SKILL_NAME = "Умный Папа";

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
    console.log(`👉 Start processing command=[${command}]`);

    console.log("👉 Request openRouter");
    const parsed = await parseAlisaCommandWithOpenRouter(command);
    openRouterResponseTime = Date.now() - startTime;
    console.log(
        `✅ Response from openRouter for command=[${command}], parsed=[${JSON.stringify(parsed)}], openRouterResponseTime=[${openRouterResponseTime}ms]`,
    );

    const { items, error } = parsed;
    let addedItems: string[] = items ?? [];

    if (error !== null) {
        openRouterError = `❌ Open router request completed with error=[${error}]`;
        console.error(openRouterError);

        addedItems = [command];
    }

    if (items.length === 0) {
        openRouterError = `❌ Open router request responded with no items`;
        console.error(openRouterError);

        addedItems = [command];
    }

    const itemsString = items.join(", ");

    const startTimeSupabase = Date.now();
    let supabaseResponseTime = 0;
    console.log(`👉 Adding items=[${itemsString}] to Supabase`);
    try {
        await addItemsToSupabaseGroceryList(addedItems);
        supabaseResponseTime = Date.now() - startTimeSupabase;
    } catch (err) {
        const supabaseErrorString = `❌ Failed to add items=[${itemsString}] to Supabase: ${err}`;
        console.error(supabaseErrorString);
        supabaseResponseTime = Date.now() - startTimeSupabase;

        return {
            openRouterResponseTime,
            supabaseResponseTime,
            openRouterError,
            supabaseErrorString,
            addedItems,
        };
    }
    console.log(`✅ Successfully added items=[${itemsString}] to Supabase`);

    console.log(
        `✅ Successfully parsed and added list=[${itemsString}] during=[${((Date.now() - startTime) / 1000).toFixed(2)}]s`,
    );
    return {
        openRouterResponseTime,
        supabaseResponseTime,
        openRouterError,
        supabaseErrorString: null,
        addedItems,
    };
}
