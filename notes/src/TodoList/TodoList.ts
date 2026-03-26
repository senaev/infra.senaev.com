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

export type PendingFocus = { id: number; selectionStart: number; selectionEnd: number };

export class TodoList {
    public isLoading = true;
    public errors: string[] = [];

    pendingFocus: PendingFocus | null = null;

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

    // Temp ids are used for optimistic rendering of newly created items
    // They are also used when rendering items to avoid rerendering after getting real id
    private nextTempId = -1;
    private readonly generateNextItemId = () => this.nextTempId--;
    private readonly tempIdsMap = new Map<number, number>();
    private readonly tempIdsRemovedSet = new Set<number>();
    private readonly tempUpdatesMap = new Map<
        number,
        Partial<Pick<TodoListItem, "title" | "position" | "checked">>
    >();

    public getItemClientKey(item: TodoListItem): number {
        return this.tempIdsMap.get(item.id) || item.id;
    }

    public readonly showError = (message: string) => {
        this.errors.push(message);
        this.onChange();
    };

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

    public changeItemLocally(id: number, updates: Partial<TodoListItem>): void {
        this.setItems(
            this.getItems().map((item) => (item.id === id ? { ...item, ...updates } : item)),
        );
    }

    public removeItemLocally(id: number): void {
        const itemToRemove = this.getItems().find((item) => item.id === id);

        if (!itemToRemove) {
            this.showError(`removeItem: item with id ${id} not found`);
            return;
        }

        this.setItems(this.getItems().filter((item) => item.id !== id));
    }

    public removeItemRemotely(id: number): void {
        if (id < 0) {
            // Item has NOT been persisted yet, add to list to remove after persistence
            this.tempIdsRemovedSet.add(id);
            return;
        }

        TodoListTable.delete(id).catch((error) => {
            this.showError(error.message);
        });
    }

    public removeItem(id: number) {
        this.removeItemLocally(id);
        this.removeItemRemotely(id);
    }

    public persistItem(
        id: number,
        updates: Partial<Pick<TodoListItem, "title" | "position" | "checked">>,
    ): void {
        const itemToUpdate = this.getItems().find((item) => item.id === id);
        if (!itemToUpdate) {
            this.showError(`persistItem: item with id ${id} not found`);
            return;
        }

        const previousUpdateIndex = itemToUpdate.update_index;
        const nextUpdateIndex = previousUpdateIndex + 1;
        this.changeItemLocally(id, { update_index: nextUpdateIndex });

        if (id < 0) {
            this.tempUpdatesMap.set(id, { ...this.tempUpdatesMap.get(id), ...updates });
            return;
        }

        TodoListTable.update(id, { ...updates, update_index: nextUpdateIndex })
            .then((result) => {
                if (result === "update_index_conflict") {
                    // Ignore conflicts, persistent state will be delivered through server-push
                    return;
                }

                // Check that local item has not been removed during update
                const localItem = this.getItems().find((item) => item.id === id);
                if (localItem) {
                    this.changeItemLocally(id, { persisted: true });
                }
            })
            .catch((error) => {
                this.showError(error.message);
            });
    }

    public setPendingFocus(focus: PendingFocus | null) {
        this.pendingFocus = focus;
        this.onChange();
    }

    public insertItem({
        title,
        checked,
        position,
    }: {
        title: string;
        checked: boolean;
        position: number;
    }) {
        const itemsWithHigherPosition = this.getItems()
            .filter((item) => item.position >= position)
            .sort((first, second) => first.position - second.position);

        let busyPosition = position;
        const shiftedItems: Map<number, number> = new Map();
        for (const { id, position } of itemsWithHigherPosition) {
            if (position !== busyPosition) {
                break;
            }

            busyPosition++;
            shiftedItems.set(id, busyPosition);
        }

        shiftedItems.forEach((nextPosition, id) => {
            this.setItems(
                this.getItems().map((item) => {
                    if (item.id === id) {
                        return { ...item, position: nextPosition, persisted: false };
                    }

                    return item;
                }),
            );

            this.persistItem(id, { position: nextPosition });
        });

        const tempId = this.generateNextItemId();

        const newItem: TodoListItem = {
            id: tempId,
            todo_list_id: this.todoListId,
            title,
            created: "",
            updated: "",
            position,
            checked,
            update_index: 0,
            persisted: false,
        };

        this.setItems([...this.getItems(), newItem]);

        this.setPendingFocus({
            id: tempId,
            selectionStart: 0,
            selectionEnd: 0,
        });

        TodoListTable.create(newItem)
            .then((data) => {
                // Item was deleted on the client
                if (this.tempIdsRemovedSet.delete(tempId)) {
                    this.removeItemRemotely(data.id);
                    return;
                }

                this.tempIdsMap.set(data.id, tempId);

                const tempUpdate = this.tempUpdatesMap.get(tempId);
                this.changeItemLocally(tempId, {
                    id: data.id,
                    created: data.created,
                    updated: data.updated,
                    persisted: !tempUpdate,
                });
                if (tempUpdate) {
                    this.tempUpdatesMap.delete(tempId);
                    this.persistItem(data.id, tempUpdate);
                }
            })
            .catch((error) => {
                this.showError(error.message);
            });
    }

    public createItem() {
        const nextPosition = Math.max(...this.getItems().map((item) => item.position), 0) + 1;
        this.insertItem({ title: "", checked: false, position: nextPosition });
    }

    public updateItem(id: number, params: { title?: string; checked?: boolean }) {
        const itemToUpdate = this.getItems().find((item) => item.id === id);

        if (!itemToUpdate) {
            this.showError(`updateItem: item not found id=[${id}]`);
            return;
        }

        let nothingToUpdate = true;
        for (const [key, value] of Object.entries(params)) {
            if (itemToUpdate[key as keyof TodoListItem] !== value) {
                nothingToUpdate = false;
                break;
            }
        }
        if (nothingToUpdate) {
            return;
        }

        this.changeItemLocally(id, { ...params, persisted: false });
        this.persistItem(id, params);
    }

    public createItemAfter({
        id,
        checked,
        titleBefore,
        titleAfter,
    }: {
        id: number;
        checked: boolean;
        titleBefore: string;
        titleAfter: string;
    }) {
        const currentItem = this.getItems().find((item) => item.id === id);

        if (!currentItem) {
            this.showError(`createItemAfter: item with id ${id} not found`);
            return;
        }

        const nextPosition = currentItem.position + 1;

        this.updateItem(id, { title: titleBefore, checked });

        this.insertItem({
            title: titleAfter,
            checked: titleAfter.trim() ? checked : false,
            position: nextPosition,
        });
    }

    public toggleChecked(id: number, isChecked: boolean) {
        this.setItems(
            this.getItems().map((item) =>
                item.id === id ? { ...item, checked: isChecked } : item,
            ),
        );
        this.persistItem(id, { checked: isChecked });
    }

    public mergeItemWithPrevious(id: number) {
        const sortedItems = [...this.getItems()].sort(
            (first, second) => first.position - second.position,
        );
        const currentIndex = sortedItems.findIndex((item) => item.id === id);

        if (currentIndex <= 0) {
            return;
        }

        const currentItem = sortedItems[currentIndex];
        const previousItem = sortedItems[currentIndex - 1];
        const mergedTitle = previousItem.title + currentItem.title;
        const cursorPosition = previousItem.title.length;

        this.setItems(
            this.getItems().map((item) => {
                if (item.id === previousItem.id) {
                    return { ...item, title: mergedTitle };
                }

                return item;
            }),
        );

        this.persistItem(previousItem.id, { title: mergedTitle });
        this.removeItemLocally(currentItem.id);
        this.removeItemRemotely(currentItem.id);
        this.setPendingFocus({
            id: previousItem.id,
            selectionStart: cursorPosition,
            selectionEnd: cursorPosition,
        });
    }
}
