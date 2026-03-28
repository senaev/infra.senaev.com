import { supabase } from "../supabase/supabase";
import { TodoListItem } from "../types/TodoListItem";
import { SplitCommaAndTrim } from "../utils/SplitCommaAndTrim";

const TABLE_NAME = "todo_lists_items";
const ITEM_COLUMNS = "id, todo_list_id, title, position, created, updated, update_index, checked";

type TableColumns = SplitCommaAndTrim<typeof ITEM_COLUMNS>;

export class TodoListTable {
    public static async create({
        todo_list_id,
        title,
        position,
        checked,
        update_index,
    }: Pick<
        TodoListItem,
        "todo_list_id" | "title" | "position" | "checked" | "update_index"
    >): Promise<Record<TableColumns, any>> {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .insert({
                todo_list_id,
                title,
                position,
                checked,
                update_index,
            })
            .select(ITEM_COLUMNS)
            .single();

        if (error) {
            throw new Error(`insertItemAtPosition: ${error.message}`);
        }

        return data;
    }

    public static async readAll(todoListId: number): Promise<Pick<TodoListItem, TableColumns>[]> {
        const { error, data } = await supabase
            .from(TABLE_NAME)
            .select(ITEM_COLUMNS)
            .eq("todo_list_id", todoListId);

        if (error) {
            throw new Error(
                `Error loading todo list items for id=[${todoListId}] error=[${error.message}]`,
            );
        }

        return data;
    }

    public static async update(
        itemId: number,
        updates: Partial<Pick<TodoListItem, "title" | "position" | "checked">> & {
            update_index: number;
        },
    ): Promise<"update_index_conflict" | undefined> {
        const { error } = await supabase
            .from(TABLE_NAME)
            .update(updates)
            .eq("id", itemId)
            .select(ITEM_COLUMNS)
            .single();

        if (error) {
            try {
                const json = JSON.parse(error.message);

                if (json.id === "update_index_conflict") {
                    return "update_index_conflict";
                }
            } catch (e) {}

            throw new Error(`updateTodoListItem(${itemId}) error: ${error.message}`);
        }

        return undefined;
    }

    public static async delete(itemId: number): Promise<void> {
        const { error } = await supabase.from(TABLE_NAME).delete().eq("id", itemId);

        if (error) {
            throw new Error(`deleteTodoListItem(${itemId}) error: ${error.message}`);
        }
    }
}
