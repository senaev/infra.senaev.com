import { TodoListItem } from "../TodoList/TodoList";
import { supabase } from "../utils/supabase";

// TODO: remove export
export const TABLE_NAME = "todo_lists_items";
export const ITEM_COLUMNS =
    "id, todo_list_id, title, position, created, updated, update_index, checked";

type Trim<S extends string> = S extends ` ${infer T}`
    ? Trim<T>
    : S extends `${infer T} `
      ? Trim<T>
      : S;

type SplitComma<S extends string> = S extends `${infer Head},${infer Tail}`
    ? Trim<Head> | SplitComma<Tail>
    : Trim<S>;

type ItemColumn = SplitComma<typeof ITEM_COLUMNS>;

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
}
