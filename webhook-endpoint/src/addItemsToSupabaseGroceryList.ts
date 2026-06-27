import { insertSupabaseRows } from "./supabase";

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

    await insertSupabaseRows("notes_items", rows);
}
