import { SupabaseClient } from "@supabase/supabase-js";
import { NoteItem } from "../types/NoteItem";
import { SplitCommaAndTrim } from "../utils/SplitCommaAndTrim";

const TABLE_NAME = "notes_items";
const TABLE_COLUMNS =
    "id, list_id, child, title, position, created, updated, update_index, check_time";
type TableColumns = SplitCommaAndTrim<typeof TABLE_COLUMNS>;

export class NoteItemsTable {
    constructor(private readonly supabase: SupabaseClient) {}

    public async create({
        list_id,
        title,
        position,
        check_time,
        update_index,
        child,
    }: Pick<
        NoteItem,
        "list_id" | "title" | "position" | "check_time" | "update_index" | "child"
    >): Promise<Record<TableColumns, any>> {
        const { data, error } = await this.supabase
            .from(TABLE_NAME)
            .insert({
                list_id,
                title,
                position,
                check_time,
                update_index,
                child,
            })
            .select(TABLE_COLUMNS)
            .single();

        if (error) {
            throw new Error(`NoteItemsTable.create: ${error.message}`);
        }

        return data;
    }

    public async readAll(listId: number): Promise<Pick<NoteItem, TableColumns>[]> {
        const { error, data } = await this.supabase
            .from(TABLE_NAME)
            .select(TABLE_COLUMNS)
            .eq("list_id", listId);

        if (error) {
            throw new Error(
                `NoteItemsTable.readAll: Error loading list items for id=[${listId}] error=[${error.message}]`,
            );
        }

        return data;
    }

    public async update(
        itemId: number,
        updates: Partial<Pick<NoteItem, "title" | "position" | "check_time">> & {
            update_index: number;
        },
    ): Promise<
        | "update_index_conflict"
        | {
              updated: string;
          }
    > {
        const { error, data } = await this.supabase
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

            throw new Error(`NoteItemsTable.update(${itemId}) error: ${error.message}`);
        }

        return {
            updated: data.updated,
        };
    }

    public async delete(itemId: number): Promise<void> {
        const { error } = await this.supabase.from(TABLE_NAME).delete().eq("id", itemId);

        if (error) {
            throw new Error(`NoteItemsTable.delete(${itemId}) error: ${error.message}`);
        }
    }
}
