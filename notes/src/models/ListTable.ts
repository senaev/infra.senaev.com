import { supabase } from "../supabase/supabase";
import { ListItem } from "../types/ListItem";
import { SplitCommaAndTrim } from "../utils/SplitCommaAndTrim";

const TABLE_NAME = "lists_items";
const TABLE_COLUMNS =
    "id, list_id, child, title, position, created, updated, update_index, checked";
type TableColumns = SplitCommaAndTrim<typeof TABLE_COLUMNS>;

export class ListTable {
    public static async create({
        list_id,
        title,
        position,
        checked,
        update_index,
        child,
    }: Pick<
        ListItem,
        "list_id" | "title" | "position" | "checked" | "update_index" | "child"
    >): Promise<Record<TableColumns, any>> {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .insert({
                list_id,
                title,
                position,
                checked,
                update_index,
                child,
            })
            .select(TABLE_COLUMNS)
            .single();

        if (error) {
            throw new Error(`ListTable.create: ${error.message}`);
        }

        return data;
    }

    public static async readAll(listId: number): Promise<Pick<ListItem, TableColumns>[]> {
        const { error, data } = await supabase
            .from(TABLE_NAME)
            .select(TABLE_COLUMNS)
            .eq("list_id", listId);

        if (error) {
            throw new Error(`Error loading list items for id=[${listId}] error=[${error.message}]`);
        }

        return data;
    }

    public static async update(
        itemId: number,
        updates: Partial<Pick<ListItem, "title" | "position" | "checked">> & {
            update_index: number;
        },
    ): Promise<
        | "update_index_conflict"
        | {
              updated: string;
          }
    > {
        const { error, data } = await supabase
            .from(TABLE_NAME)
            .update(updates)
            .eq("id", itemId)
            .select(TABLE_COLUMNS)
            .single();

        if (error) {
            try {
                const json = JSON.parse(error.message);

                if (json.id === "update_index_conflict") {
                    return "update_index_conflict";
                }
            } catch (e) {}

            throw new Error(`ListTable.update(${itemId}) error: ${error.message}`);
        }

        return {
            updated: data.updated,
        };
    }

    public static async delete(itemId: number): Promise<void> {
        const { error } = await supabase.from(TABLE_NAME).delete().eq("id", itemId);

        if (error) {
            throw new Error(`ListTable.delete(${itemId}) error: ${error.message}`);
        }
    }
}
