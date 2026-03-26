import { TodoListTable } from "../Tables/TodoListTable";

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
    public isLoading = true;
    public errors: string[] = [];

    private items: TodoListItem[] = [];

    public constructor(
        private readonly todoListId: number,
        private readonly onChange: () => void,
    ) {
        TodoListTable.readAll(this.todoListId)
            .then((data) => {
                this.setItems(data.map((item) => ({ ...item, persisted: true })));
            })
            .catch((error) => {
                this.errors.push(error.message);
            })
            .finally(() => {
                this.isLoading = false;
                this.onChange();
            });
    }

    // TODO: remove
    public readonly showError = (message: string) => {
        this.errors.push(message);
        this.onChange();
    };

    // TODO: remove
    public readonly removeError = (index: number) => {
        this.errors.splice(index, 1);
        this.onChange();
    };

    public getItems() {
        return this.items;
    }

    public getTitle() {
        return NOTE_TITLE;
    }

    public setItems(items: TodoListItem[]): void {
        const itemsChanged = JSON.stringify(this.items) !== JSON.stringify(items);
        if (itemsChanged) {
            this.items = items;
        }

        if (itemsChanged) {
            this.onChange();
        }
    }
}
