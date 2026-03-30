import { ListTable } from "../models/ListTable";
import { ListItem } from "../types/ListItem";
import { shiftItemsToInsertOnPosition } from "../utils/shiftItemsToInsertOnPosition/shiftItemsToInsertOnPosition";

const NOTE_TITLE = "Groceries 🛒";

export type PendingFocus = { id: number; selectionStart: number; selectionEnd: number };

export class List {
    pendingFocus: PendingFocus | null = null;

    private items: ListItem[] = [];

    public constructor(
        private readonly params: {
            listId: number;
            onChange: () => void;
            showError: (message: string) => void;
        },
    ) {
        ListTable.readAll(this.params.listId)
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
        Partial<Pick<ListItem, "title" | "position" | "checked">>
    >();

    public getItemClientKey(item: ListItem): number {
        return this.tempIdsMap.get(item.id) || item.id;
    }

    public getItems() {
        return this.items;
    }

    public getTitle() {
        return NOTE_TITLE;
    }

    public setItems(items: ListItem[]): void {
        const itemsChanged = JSON.stringify(this.items) !== JSON.stringify(items);
        if (itemsChanged) {
            this.items = items;
        }

        if (itemsChanged) {
            this.params.onChange();
        }
    }

    public changeItemLocally(id: number, updates: Partial<ListItem>): void {
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

        ListTable.delete(id).catch((error) => {
            this.params.showError(error.message);
        });
    }

    public removeItem(id: number) {
        this.removeItemLocally(id);
        this.removeItemRemotely(id);
    }

    public persistItem(
        id: number,
        updates: Partial<Pick<ListItem, "title" | "position" | "checked" | "parent_id">>,
    ): void {
        const itemToUpdate = this.items.find((item) => item.id === id);
        if (!itemToUpdate) {
            this.params.showError(`persistItem: item with id ${id} not found`);
            return;
        }

        const update_index = itemToUpdate.update_index + 1;
        const updated = new Date().toISOString();
        this.changeItemLocally(id, { update_index, updated, persisted: false });

        if (id < 0) {
            this.tempUpdatesMap.set(id, { ...this.tempUpdatesMap.get(id), ...updates });
            return;
        }

        ListTable.update(id, { ...updates, update_index })
            .then((result) => {
                if (result === "update_index_conflict") {
                    // Ignore conflicts, persistent state will be delivered through server-push
                    return;
                }

                // Check that local item has not been removed during update
                const localItem = this.items.find((item) => item.id === id);
                if (localItem) {
                    this.changeItemLocally(id, { updated: result.updated, persisted: true });
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

    public getEditingItemsSorted(): ListItem[] {
        return [...this.items].sort((first, second) => first.position - second.position);
        // .filter((item) => !item.checked);
    }

    public moveItems(
        id: number,
        {
            dropIndex,
            makeChild,
            count,
        }: {
            dropIndex: number;
            makeChild: boolean;
            count: number;
        },
    ) {
        const sortedItems = this.getEditingItemsSorted();

        const sourceIndex = sortedItems.findIndex((item) => item.id === id);
        if (sourceIndex === -1) {
            this.params.showError(`moveItem: item not found with id=[${id}]`);
            return;
        }

        const sourceItem = sortedItems[sourceIndex];
        if (!sourceItem) {
            this.params.showError(`moveItem: item not found on sourceIndex=[${sourceIndex}]`);
            return;
        }

        const isSourceChild = sourceItem.parent_id != null;

        if (sourceIndex === dropIndex && isSourceChild === makeChild) {
            return;
        }

        const itemsToMove = sortedItems.slice(sourceIndex, sourceIndex + count);

        let startPosition = 1;
        let firstItemIsChild = false;
        if (dropIndex > 0) {
            const previousItem = sortedItems[dropIndex - 1];
            if (!previousItem) {
                this.params.showError(`moveItem: no previousItem for dropIndex=[${dropIndex}]`);
                return;
            }

            startPosition = previousItem.position + 1;

            if (makeChild) {
                firstItemIsChild = true;
            }
        }

        this.shiftElementsToInsertOnPosition(startPosition, count);

        for (let i = 0; i < count; i++) {
            const item = itemsToMove[i];

            const position = startPosition + i;
            const parent_id = i === 0 ? (firstItemIsChild ? 1 : null) : 1;

            this.changeItemLocally(item.id, {
                position,
                parent_id,
                persisted: false,
            });
            this.persistItem(item.id, { position, parent_id });
        }
    }

    private shiftElementsToInsertOnPosition(position: number, count: number) {
        const shiftedItems: Map<number, number> = shiftItemsToInsertOnPosition(
            this.items,
            position,
            count,
        );

        shiftedItems.forEach((nextPosition, id) => {
            this.changeItemLocally(id, {
                position: nextPosition,
                persisted: false,
            });

            this.persistItem(id, { position: nextPosition });
        });
    }

    public insertItem({
        title,
        checked,
        position,
        isChild,
    }: {
        title: string;
        checked: boolean;
        position: number;
        isChild: boolean;
    }) {
        this.shiftElementsToInsertOnPosition(position, 1);

        const tempId = this.generateNextItemId();

        const newItem: ListItem = {
            id: tempId,
            list_id: this.params.listId,
            title,
            created: "",
            updated: "",
            position,
            checked,
            update_index: 0,
            persisted: false,
            parent_id: isChild ? 1 : null,
        };

        this.setItems([...this.items, newItem]);

        this.setPendingFocus({
            id: tempId,
            selectionStart: 0,
            selectionEnd: 0,
        });

        ListTable.create(newItem)
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

    public createNewItemAtTheEnd() {
        const nextPosition = Math.max(...this.items.map((item) => item.position), 0) + 1;
        this.insertItem({ title: "", checked: false, position: nextPosition, isChild: false });
    }

    public createItemAfter({
        id,
        checked,
        isChild,
        titleBefore,
        titleAfter,
    }: {
        id: number;
        checked: boolean;
        isChild: boolean;
        titleBefore: string;
        titleAfter: string;
    }) {
        const currentItem = this.items.find((item) => item.id === id);

        if (!currentItem) {
            this.params.showError(`createItemAfter: item not found id=[${id}]`);
            return;
        }

        const params = { title: titleBefore, checked };

        this.changeItemLocally(id, { ...params, persisted: false });
        this.persistItem(id, params);

        const nextPosition = currentItem.position + 1;
        this.insertItem({
            title: titleAfter,
            isChild,
            checked: titleAfter.trim() ? checked : false,
            position: nextPosition,
        });
    }

    public toggleChecked(id: number, checked: boolean): void {
        const item = this.items.find((item) => item.id === id);
        if (!item) {
            this.params.showError(`toggleChecked: item not found id=[${id}]`);
            return;
        }

        this.changeItemLocally(id, {
            checked,
            persisted: false,
        });
        this.persistItem(id, { checked });

        if (item.parent_id === null) {
            const children = this.items.filter((child) => child.parent_id === id);
            console.log("children", children);
        } else {
            this.persistItem(item.parent_id, {});
        }
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
