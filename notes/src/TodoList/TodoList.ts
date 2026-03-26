const NOTE_TITLE = "Groceries 🛒";

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
};

export class TodoList {
    private items: TodoListItem[] = [];

    public constructor(
        private readonly id: number,
        private readonly onChange: () => void,
    ) {}

    getItems() {
        return this.items;
    }

    getTitle() {
        return NOTE_TITLE;
    }

    setItems(items: TodoListItem[]): void {
        const itemsChanged = JSON.stringify(this.items) !== JSON.stringify(items);
        if (itemsChanged) {
            this.items = items;
        }

        if (itemsChanged) {
            this.onChange();
        }
    }
}
