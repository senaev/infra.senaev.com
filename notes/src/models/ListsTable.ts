import { supabase } from "../supabase/supabase";
import { ListItem } from "../types/ListItem";
import { SplitCommaAndTrim } from "../utils/SplitCommaAndTrim";

const TABLE_NAME = "lists";
const TABLE_COLUMNS = "id, title, created, updated";

type TableColumns = SplitCommaAndTrim<typeof TABLE_COLUMNS>;

export class ListsTable {
    public static async create({ title }: { title: string }): Promise<Record<TableColumns, any>> {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .insert({ title })
            .select(TABLE_COLUMNS)
            .single();

        if (error) {
            throw new Error(`ListsTable.create: ${error.message}`);
        }

        return data;
    }

    public static async readAll(): Promise<Pick<ListItem, TableColumns>[]> {
        const { error, data } = await supabase.from(TABLE_NAME).select(TABLE_COLUMNS);

        if (error) {
            throw new Error(`ListsTable.readAll error: ${error.message}`);
        }

        return data;
    }

    public static async update(
        id: number,
        updates: {
            title?: string;
        },
    ): Promise<void> {
        const { error } = await supabase
            .from(TABLE_NAME)
            .update(updates)
            .eq("id", id)
            .select(TABLE_COLUMNS)
            .single();

        if (error) {
            throw new Error(`updateListItem(${id}) error: ${error.message}`);
        }
    }

    public static async delete(id: number): Promise<void> {
        const { error } = await supabase.from(TABLE_NAME).delete().eq("id", id);

        if (error) {
            throw new Error(`ListsTable.delete(${id}) error: ${error.message}`);
        }
    }
}
