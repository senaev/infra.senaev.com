import { SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY } from "./env";

const SUPABASE_LIST_ID = 1;

export async function addItemsToSupabaseGroceryList(items: string[]): Promise<void> {
    const startPosition = Math.floor(Date.now() / 1000);
    const rows = items.map((title, index) => ({
        list_id: SUPABASE_LIST_ID,
        child: false,
        title,
        position: startPosition + index,
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
