import { randomUUID } from "node:crypto";

import { insertSupabaseRows } from "./supabase";

export async function addItemsToSupabaseGroceryList(items: string[]): Promise<void> {
    const rows = items.map((title) => ({
        id: randomUUID(),
        title,
    }));

    await insertSupabaseRows("items", rows);
}
