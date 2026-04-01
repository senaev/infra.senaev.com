import { NoteItemsTable } from "../tables/NoteItemsTable";
import { NoteItem } from "../types/NoteItem";
import { shiftItemsToInsertOnPosition } from "../utils/shiftItemsToInsertOnPosition/shiftItemsToInsertOnPosition";

export type PendingFocus = { id: number; selectionStart: number; selectionEnd: number };

export type ItemParentGroup = { parent: NoteItem; children: NoteItem[] };

export function flattenGroups(groups: ItemParentGroup[]): NoteItem[] {
    return groups.reduce<NoteItem[]>((acc, group) => {
        acc.push(group.parent, ...group.children);
        return acc;
    }, []);
}

export class Note {
    pendingFocus: PendingFocus | null = null;

    private items: NoteItem[] = [];

    public constructor(
        private readonly params: {
            noteItemsTable: NoteItemsTable;
            listId: number;
            onChange: () => void;
            showError: (message: string) => void;
        },
    ) {
        this.params.noteItemsTable
            .readAll(this.params.listId)
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
    private nextTempId = -1;
    private readonly generateNextItemId = () => this.nextTempId--;
    private readonly tempIdsMap = new Map<number, number>();
    private readonly tempIdsRemovedSet = new Set<number>();
    private readonly tempUpdatesMap = new Map<
        number,
        Partial<Pick<NoteItem, "title" | "position" | "check_time">>
    >();

    public getItemsSorted(): NoteItem[] {
        return [...this.items].sort((first, second) => first.position - second.position);
    }

    public getItemsSortedGroupedByParent(): ItemParentGroup[] {
        const sorted = this.getItemsSorted();

        const grouped: ItemParentGroup[] = [];
        let currentGroup: ItemParentGroup | null = null;
        for (const item of sorted) {
            if (item.child && currentGroup) {
                currentGroup.children.push(item);
            } else {
                currentGroup = { parent: item, children: [] };
                grouped.push(currentGroup);
            }
        }

        return grouped;
    }

    public getItemGroupsSplit(): { checked: ItemParentGroup[]; unchecked: ItemParentGroup[] } {
        const groupedByParent = this.getItemsSortedGroupedByParent();

        const checked: ItemParentGroup[] = [];
        const unchecked: ItemParentGroup[] = [];

        for (const group of groupedByParent) {
            const { parent, children } = group;
            if (parent.check_time && children.every((child) => child.check_time)) {
                checked.push(group);
            } else {
                unchecked.push(group);
            }
        }

        checked.sort((first, second) => {
            const firstCheckTime = new Date(first.parent.check_time!).getTime();
            const secondCheckTime = new Date(second.parent.check_time!).getTime();

            return secondCheckTime - firstCheckTime;
        });

        return { checked, unchecked };
    }

    public getItemClientKey(item: NoteItem): number {
        return this.tempIdsMap.get(item.id) || item.id;
    }

    public getItems() {
        return this.items;
    }

    public setItems(items: NoteItem[]): void {
        const itemsChanged = JSON.stringify(this.items) !== JSON.stringify(items);
        if (itemsChanged) {
            this.items = items;
        }

        if (itemsChanged) {
            this.params.onChange();
        }
    }

    public changeItemLocally(id: number, updates: Partial<NoteItem>): void {
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

        this.params.noteItemsTable.delete(id).catch((error) => {
            this.params.showError(error.message);
        });
    }

    public removeItem(id: number) {
        this.removeItemLocally(id);
        this.removeItemRemotely(id);
    }

    public persistItem(
        id: number,
        updates: Partial<Pick<NoteItem, "title" | "position" | "check_time" | "child">>,
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

        this.params.noteItemsTable
            .update(id, { ...updates, update_index })
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
                const itemStillExists = this.items.some((item) => item.id === id);
                this.params.showError(
                    `persistItem: error id=[${id}] [${error.message}] itemStillExists=[${itemStillExists}]`,
                );
            });
    }

    public setPendingFocus(focus: PendingFocus | null) {
        this.pendingFocus = focus;
        this.params.onChange();
    }

    public moveItems(
        id: number,
        {
            dropIndex,
            child,
            count,
        }: {
            dropIndex: number;
            child: boolean;
            count: number;
        },
    ) {
        const uncheckedGroups = this.getItemGroupsSplit();

        const unchecked = flattenGroups(uncheckedGroups.unchecked);

        const sourceIndex = unchecked.findIndex((item) => item.id === id);
        if (sourceIndex === -1) {
            this.params.showError(`moveItem: item not found with id=[${id}]`);
            return;
        }

        const sourceItem = unchecked[sourceIndex];
        if (!sourceItem) {
            this.params.showError(`moveItem: item not found on sourceIndex=[${sourceIndex}]`);
            return;
        }

        if (sourceIndex === dropIndex && sourceItem.child === child) {
            return;
        }

        const itemsToMove = unchecked.slice(sourceIndex, sourceIndex + count);

        let startPosition = 1;
        let firstItemIsChild = false;
        if (dropIndex > 0) {
            const previousItem = unchecked[dropIndex - 1];
            if (!previousItem) {
                this.params.showError(`moveItem: no previousItem for dropIndex=[${dropIndex}]`);
                return;
            }

            startPosition = previousItem.position + 1;

            if (child) {
                firstItemIsChild = true;
            }
        }

        this.shiftElementsToInsertOnPosition(startPosition, count);

        for (let i = 0; i < count; i++) {
            const item = itemsToMove[i];

            const position = startPosition + i;
            const child = i === 0 ? firstItemIsChild : true;

            this.changeItemLocally(item.id, {
                position,
                child,
                persisted: false,
            });
            this.persistItem(item.id, { position, child });
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
        check_time,
        position,
        child,
    }: {
        title: string;
        check_time: string | null;
        position: number;
        child: boolean;
    }) {
        this.shiftElementsToInsertOnPosition(position, 1);

        const tempId = this.generateNextItemId();

        const newItem: NoteItem = {
            id: tempId,
            list_id: this.params.listId,
            title,
            created: "",
            updated: "",
            position,
            check_time,
            update_index: 0,
            persisted: false,
            child,
        };

        this.setItems([...this.items, newItem]);

        this.setPendingFocus({
            id: tempId,
            selectionStart: 0,
            selectionEnd: 0,
        });

        this.params.noteItemsTable
            .create(newItem)
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

    public getPositionAtTheEnd(): number {
        return Math.max(...this.items.map((item) => item.position), 0) + 1;
    }

    public createNewItemAtTheEnd() {
        const nextPosition = this.getPositionAtTheEnd();
        this.insertItem({ title: "", check_time: null, position: nextPosition, child: false });
    }

    public createItemAfter({
        id,
        selectionStart,
        selectionEnd,
    }: {
        id: number;
        selectionStart: number;
        selectionEnd: number;
    }) {
        const currentItem = this.items.find((item) => item.id === id);

        if (!currentItem) {
            this.params.showError(`createItemAfter: item not found id=[${id}]`);
            return;
        }

        const titlePrevious = currentItem.title.slice(0, selectionStart);
        const titleNew = currentItem.title.slice(selectionEnd);

        const previousParams = { title: titlePrevious };
        this.changeItemLocally(id, { ...previousParams, persisted: false });
        this.persistItem(id, previousParams);

        const nextPosition = currentItem.position + 1;
        this.insertItem({
            title: titleNew,
            child: currentItem.child,
            check_time: currentItem.check_time,
            position: nextPosition,
        });
    }

    public toggleChecked(id: number, checked: boolean): void {
        const itemsSorted = this.getItemsSorted();

        const itemIndex = itemsSorted.findIndex((item) => item.id === id);
        if (itemIndex === -1) {
            this.params.showError(`toggleChecked: item not found id=[${id}]`);
            return;
        }

        const item = itemsSorted[itemIndex];
        if (!item) {
            this.params.showError(`toggleChecked: item not found id=[${id}]`);
            return;
        }

        const check_time = checked ? new Date().toISOString() : null;
        this.changeItemLocally(id, {
            check_time,
            persisted: false,
        });
        this.persistItem(id, { check_time });

        if (item.child) {
            let parentItem: NoteItem | undefined;
            for (let i = itemIndex - 1; i >= 0; i--) {
                const isParent = !itemsSorted[i].child;
                if (isParent) {
                    parentItem = itemsSorted[i];
                    break;
                }
            }

            if (!parentItem) {
                this.params.showError(`toggleChecked: parent item not found for id=[${id}]`);
                return;
            }

            this.persistItem(parentItem.id, {});
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
