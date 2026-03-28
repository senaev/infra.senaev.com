export type TodoListItem = {
    id: number;
    todo_list_id: number;
    title: string;
    position: number;
    created: string;
    updated: string;
    update_index: number;
    checked: boolean;
    persisted: boolean;
    parent_id: number | null;
};
