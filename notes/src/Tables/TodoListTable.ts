import { TodoListItem } from "../TodoList/TodoList";
import { SplitCommaAndTrim } from "../utils/SplitCommaAndTrim";
import { supabase } from "../utils/supabase";

// TODO: remove export
export const TABLE_NAME = "todo_lists_items";
export const ITEM_COLUMNS =
    "id, todo_list_id, title, position, created, updated, update_index, checked";

type ItemColumn = SplitCommaAndTrim<typeof ITEM_COLUMNS>;

export class TodoListTable {
    public static async getAllTodosForTodoList(
        todoListId: number,
    ): Promise<Pick<TodoListItem, ItemColumn>[]> {
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

    public static async updateTodoListItem(
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
}
