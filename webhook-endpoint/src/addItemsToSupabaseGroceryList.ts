import { randomUUID } from "node:crypto";

import { insertSupabaseRows } from "./supabase";

export async function addItemsToSupabaseGroceryList(items: string[]): Promise<void> {
    const rows = items.map((title) => ({
        id: randomUUID(),
        title,
        // The tricky-dad list-notes database requires a non-null `type`
        // column; grocery-list items are always of this type.
        type: "Продуктовый",
    }));

    await insertSupabaseRows("items", rows);
}
