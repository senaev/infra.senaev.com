import "./App.css";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { supabase } from "./utils/supabase";

type GroceryItem = {
    id: number;
    title: string;
    position: number;
    created: string;
    updated: string;
    checked: boolean;
};

type PendingFocus = {
    id: number;
    selectionStart: number;
    selectionEnd: number;
};

const TABLE_NAME = "grocery_items";

const NOTE_TITLE = "Groceries 🛒";
const ITEM_COLUMNS = "id, title, position, created, updated, checked";

let newItemId = -1;
const generateNewItemId = () => --newItemId;
const clientIdsMap = new Map<number, number>();

export default function App() {
    const [items, setItems] = useState<GroceryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
    const inputRefs = useRef(new Map<number, HTMLInputElement>());

    const [errors, setErrors] = useState<string[]>([]);

    function addError(error: string) {
        setErrors((current) => [...current, error]);
    }

    useEffect(() => {
        setIsLoading(true);

        supabase
            .from(TABLE_NAME)
            .select(ITEM_COLUMNS)
            .then((result) => {
                if (result.error) {
                    addError(result.error.message);
                } else {
                    setItems(result.data);
                }

                setIsLoading(false);
            });
    }, []);

    useEffect(() => {
        if (pendingFocus == null) {
            return;
        }

        const input = inputRefs.current.get(pendingFocus.id);
        if (!input) {
            return;
        }

        input.focus();
        input.setSelectionRange(pendingFocus.selectionStart, pendingFocus.selectionEnd);
        setPendingFocus(null);
    }, [items, pendingFocus]);

    function persistItem(
        id: number,
        updates: Partial<Pick<GroceryItem, "title" | "position" | "checked">>,
    ): void {
        if (id < 0) {
            return;
        }

        supabase
            .from(TABLE_NAME)
            .update(updates)
            .eq("id", id)
            .select(ITEM_COLUMNS)
            .single()
            .then((result) => {
                if (result.error) {
                    addError(`persistItem(${id}): ${result.error.message}`);
                    return null;
                }
            });
    }

    function deleteItem(id: number): void {
        if (id < 0) {
            addError(`deleteItem: cannot delete item with temporary id ${id}`);
            return;
        }

        supabase
            .from(TABLE_NAME)
            .delete()
            .eq("id", id)
            .then((result) => {
                if (result.error) {
                    addError(`deleteItem(${id}): ${result.error.message}`);
                }
            });
    }

    function createItem() {
        const nextPosition =
            items.reduce((maxPosition, item) => Math.max(maxPosition, item.position), 0) + 1;

        insertItem({ title: "", checked: false, position: nextPosition });
    }

    function insertItem({
        title,
        checked,
        position,
    }: {
        title: string;
        checked: boolean;
        position: number;
    }) {
        const tempId = generateNewItemId();
        const created = new Date().toISOString();
        const shiftedItems = items
            .filter((item) => item.position >= position)
            .map((item) => ({ id: item.id, position: item.position + 1 }));

        setItems((current) => {
            const nextItems = current.map((item) => {
                if (item.position >= position) {
                    return { ...item, position: item.position + 1 };
                }

                return item;
            });

            nextItems.push({
                id: tempId,
                title,
                created,
                updated: created,
                position,
                checked,
            });

            return nextItems;
        });
        setPendingFocus({
            id: tempId,
            selectionStart: 0,
            selectionEnd: 0,
        });

        shiftedItems.forEach((item) => {
            persistItem(item.id, { position: item.position });
        });

        supabase
            .from(TABLE_NAME)
            .insert({ title, position, checked })
            .select(ITEM_COLUMNS)
            .single()
            .then(({ data, error }) => {
                if (error) {
                    addError(`insertItemAtPosition: ${error.message}`);
                    return;
                }

                clientIdsMap.set(data.id, tempId);
                setItems((current) =>
                    current.map((item) => {
                        if (item.id !== tempId) {
                            return item;
                        }

                        return {
                            ...item,
                            id: data.id,
                            created: data.created,
                            updated: data.updated,
                        };
                    }),
                );
            });
    }

    function updateItem(id: number, params: { title?: string; checked?: boolean }) {
        setItems((current) =>
            current.map((item) => (item.id === id ? { ...item, ...params } : item)),
        );
        persistItem(id, params);
    }

    function createItemAfter({
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
        const currentItem = items.find((item) => item.id === id);

        if (!currentItem) {
            addError(`createItemAfter: item with id ${id} not found`);
            return;
        }

        const nextPosition = currentItem.position + 1;

        updateItem(id, { title: titleBefore, checked: titleBefore.trim() ? checked : false });
        insertItem({
            title: titleAfter,
            checked: titleAfter.trim() ? checked : false,
            position: nextPosition,
        });
    }

    function toggleChecked(id: number, isChecked: boolean) {
        setItems((current) =>
            current.map((item) => (item.id === id ? { ...item, checked: isChecked } : item)),
        );
        persistItem(id, { checked: isChecked });
    }

    function removeItem(id: number) {
        setItems((current) => current.filter((item) => item.id !== id));
        deleteItem(id);
    }

    function mergeItemWithPrevious(id: number) {
        const sortedItems = [...items].sort((first, second) => first.position - second.position);
        const currentIndex = sortedItems.findIndex((item) => item.id === id);

        if (currentIndex <= 0) {
            return;
        }

        const currentItem = sortedItems[currentIndex];
        const previousItem = sortedItems[currentIndex - 1];
        const mergedTitle = previousItem.title + currentItem.title;
        const cursorPosition = previousItem.title.length;

        setItems((current) =>
            current
                .map((item) => {
                    if (item.id === previousItem.id) {
                        return { ...item, title: mergedTitle };
                    }

                    return item;
                })
                .filter((item) => item.id !== currentItem.id),
        );

        persistItem(previousItem.id, { title: mergedTitle });
        deleteItem(currentItem.id);
        setPendingFocus({
            id: previousItem.id,
            selectionStart: cursorPosition,
            selectionEnd: cursorPosition,
        });
    }

    function handleItemKeyDown(event: KeyboardEvent<HTMLInputElement>, item: GroceryItem) {
        if (event.key === "Enter") {
            event.preventDefault();
            const cursorPosition =
                event.currentTarget.selectionStart ?? event.currentTarget.value.length;
            const titleBefore = event.currentTarget.value.slice(0, cursorPosition);
            const titleAfter = event.currentTarget.value.slice(cursorPosition);

            createItemAfter({
                id: item.id,
                checked: item.checked,
                titleBefore,
                titleAfter,
            });
        }

        if (
            event.key === "Backspace" &&
            event.currentTarget.selectionStart === 0 &&
            event.currentTarget.selectionEnd === 0
        ) {
            event.preventDefault();

            mergeItemWithPrevious(item.id);
        }
    }

    function handleItemChange(id: number, title: string) {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
        persistItem(id, { title });
    }

    return (
        <main className="page">
            <section className="editor">
                <h1 className="list-title">{NOTE_TITLE}</h1>

                {errors.length ? (
                    <p className="status error">
                        <div>Errors:</div>
                        <ul>
                            {errors.map((error, index) => (
                                <li key={`${error}-${index}`}>{error}</li>
                            ))}
                        </ul>
                    </p>
                ) : null}

                {isLoading ? (
                    <p className="status">Loading...</p>
                ) : (
                    <div className="items">
                        {[...items]
                            .sort((first, second) => first.position - second.position)
                            .map((item) => (
                                <div
                                    className="item-row"
                                    key={clientIdsMap.get(item.id) || item.id}
                                >
                                    <label className="item-checkbox-label">
                                        <input
                                            aria-label={`Mark ${item.title || "item"} as checked`}
                                            checked={Boolean(item.checked)}
                                            className="item-checkbox"
                                            onChange={(event) => {
                                                toggleChecked(item.id, event.target.checked);
                                            }}
                                            type="checkbox"
                                        />
                                    </label>
                                    <input
                                        id={`input-${item.id}`}
                                        className={`item-input${item.checked ? " is-checked" : ""}`}
                                        ref={(node) => {
                                            if (node) {
                                                inputRefs.current.set(item.id, node);
                                            } else {
                                                inputRefs.current.delete(item.id);
                                            }
                                        }}
                                        onBlur={(event) => {
                                            updateItem(item.id, { title: event.target.value });
                                        }}
                                        onChange={(event) =>
                                            handleItemChange(item.id, event.target.value)
                                        }
                                        onKeyDown={(event) => {
                                            handleItemKeyDown(event, item);
                                        }}
                                        value={item.title}
                                    />
                                    <button
                                        aria-label={`Remove ${item.title || "item"}`}
                                        className="item-remove"
                                        onClick={() => {
                                            removeItem(item.id);
                                        }}
                                        type="button"
                                    />
                                </div>
                            ))}

                        <button
                            className="add-item-button"
                            onClick={() => {
                                createItem();
                            }}
                            type="button"
                        >
                            + List item
                        </button>
                    </div>
                )}
            </section>
        </main>
    );
}
