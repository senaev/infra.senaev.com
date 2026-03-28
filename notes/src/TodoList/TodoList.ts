import { TodoListTable } from "../models/TodoListTable";
import { TodoListItem } from "../types/TodoListItem";

const NOTE_TITLE = "Groceries 🛒";

export type PendingFocus = { id: number; selectionStart: number; selectionEnd: number };

export class TodoList {
    pendingFocus: PendingFocus | null = null;

    private items: TodoListItem[] = [];

    public constructor(
        private readonly params: {
            todoListId: number;
            onChange: () => void;
            showError: (message: string) => void;
        },
    ) {
        TodoListTable.readAll(this.params.todoListId)
            .then((data) => {
                this.setItems(data.map((item) => ({ ...item, persisted: true })));
                this.params.onChange();
            })
            .catch((error) => {
                this.params.showError(error.message);
            });
    }

    // Temp ids are used for optimistic rendering of newly created items
    // They are also used when rendering items to avoid rerendering after getting real id
    // TODO: make global
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
            this.params.onChange();
        }
    }

    public changeItemLocally(id: number, updates: Partial<TodoListItem>): void {
        this.setItems(this.items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    }

    public removeItemLocally(id: number): void {
        const itemToRemove = this.items.find((item) => item.id === id);

        if (!itemToRemove) {
            this.params.showError(`removeItem: item with id ${id} not found`);
            return;
        }

        this.setItems(this.items.filter((item) => item.id !== id));
    }

    public removeItemRemotely(id: number): void {
        if (id < 0) {
            // Item has NOT been persisted yet, add to list to remove after persistence
            this.tempIdsRemovedSet.add(id);
            return;
        }

        TodoListTable.delete(id).catch((error) => {
            this.params.showError(error.message);
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
        const itemToUpdate = this.items.find((item) => item.id === id);
        if (!itemToUpdate) {
            this.params.showError(`persistItem: item with id ${id} not found`);
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
                const localItem = this.items.find((item) => item.id === id);
                if (localItem) {
                    this.changeItemLocally(id, { persisted: true });
                }
            })
            .catch((error) => {
                this.params.showError(error.message);
            });
    }

    public setPendingFocus(focus: PendingFocus | null) {
        this.pendingFocus = focus;
        this.params.onChange();
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
        const itemsWithHigherPosition = this.items
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
                this.items.map((item) => {
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
            todo_list_id: this.params.todoListId,
            title,
            created: "",
            updated: "",
            position,
            checked,
            update_index: 0,
            persisted: false,
            parent_id: null,
        };

        this.setItems([...this.items, newItem]);

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
                this.params.showError(error.message);
            });
    }

    public createItem() {
        const nextPosition = Math.max(...this.items.map((item) => item.position), 0) + 1;
        this.insertItem({ title: "", checked: false, position: nextPosition });
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
        const currentItem = this.items.find((item) => item.id === id);

        if (!currentItem) {
            this.params.showError(`createItemAfter: item not found id=[${id}]`);
            debugger;
            return;
        }

        const params = { title: titleBefore, checked };

        this.changeItemLocally(id, { ...params, persisted: false });
        this.persistItem(id, params);

        const nextPosition = currentItem.position + 1;
        this.insertItem({
            title: titleAfter,
            checked: titleAfter.trim() ? checked : false,
            position: nextPosition,
        });
    }

    public toggleChecked(id: number, isChecked: boolean) {
        this.setItems(
            this.items.map((item) => (item.id === id ? { ...item, checked: isChecked } : item)),
        );
        this.persistItem(id, { checked: isChecked });
    }

    public mergeItemWithPrevious(id: number) {
        const sortedItems = [...this.items].sort(
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
            this.items.map((item) => {
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
