import { SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY } from "./env.js";

const SUPABASE_LIST_ID = 1;

export async function addItemsToSupabaseGroceryList(items: string[]): Promise<void> {
    const rows = items.map((title) => ({
        list_id: SUPABASE_LIST_ID,
        child: false,
        title,
        position: 0,
        update_index: 1,
    }));

    const insertResponse = await fetch(`${SUPABASE_PROJECT_URL}/rest/v1/notes_items`, {
        method: "POST",
        headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
        },
        body: JSON.stringify(rows),
    });

    if (!insertResponse.ok) {
        throw new Error(
            `Failed to insert grocery list items: ${insertResponse.status} ${await insertResponse.text()}`,
        );
    }
}
