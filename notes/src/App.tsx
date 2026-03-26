import "./App.css";

import { KeyboardEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { ErrorToasts } from "./components/ErrorToasts";
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

// Temp ids are used for optimistic rendering of newly created items
// They are also used when rendering items to avoid rerendering after getting real id
let nextTempId = -1;
const generateNextItemId = () => nextTempId--;
const tempIdsMap = new Map<number, number>();
const tempIdsRemoved = new Set<number>();

export default function App() {
    const [items, setItems] = useState<GroceryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
    const inputRefs = useRef(new Map<number, HTMLTextAreaElement>());
    const desiredCaretPositionRef = useRef(0);
    const ignoreNextSelectionRef = useRef(false);

    const [errors, setErrors] = useState<string[]>([]);

    function addError(error: string) {
        setErrors((current) => [...current, error]);
    }

    function removeError(indexToRemove: number) {
        setErrors((current) => current.filter((_, index) => index !== indexToRemove));
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

        ignoreNextSelectionRef.current = true;
        input.focus();
        input.setSelectionRange(pendingFocus.selectionStart, pendingFocus.selectionEnd);
        setPendingFocus(null);
    }, [items, pendingFocus]);

    useEffect(() => {
        inputRefs.current.forEach((input) => {
            resizeTextarea(input);
        });
    }, [items]);

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

    function resizeTextarea(input: HTMLTextAreaElement) {
        input.style.height = "auto";
        input.style.height = `${input.scrollHeight}px`;
    }

    function removeItemLocally(id: number): void {
        const itemToRemove = items.find((item) => item.id === id);
        console.log({ itemToRemove });

        if (!itemToRemove) {
            addError(`removeItem: item with id ${id} not found`);
            return;
        }

        setItems((current) => current.filter((item) => item.id !== id));
    }

    function removeItemRemotely(id: number): void {
        if (id < 0) {
            // Item has NOT been persisted yet, add to list to remove after persistence
            console.log(`Removing item with temp id ${id}`);
            tempIdsRemoved.add(id);
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

    function removeItem(id: number) {
        removeItemLocally(id);
        removeItemRemotely(id);
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
        const tempId = generateNextItemId();
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

                if (tempIdsRemoved.has(tempId)) {
                    tempIdsRemoved.delete(tempId);
                    removeItemRemotely(data.id);
                    console.log(
                        `Item with temp id ${tempId} was removed before it was persisted, skipping...`,
                    );
                    return;
                }

                tempIdsMap.set(data.id, tempId);
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

        updateItem(id, { title: titleBefore, checked });
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
        removeItemRemotely(currentItem.id);
        setPendingFocus({
            id: previousItem.id,
            selectionStart: cursorPosition,
            selectionEnd: cursorPosition,
        });
    }

    function moveCaretBetweenItems({ id, direction }: { id: number; direction: "up" | "down" }) {
        const sortedItems = [...items].sort((first, second) => first.position - second.position);
        const currentIndex = sortedItems.findIndex((item) => item.id === id);

        if (currentIndex === -1) {
            return;
        }

        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        const targetItem = sortedItems[targetIndex];

        if (!targetItem) {
            return;
        }

        const firstLineLength = targetItem.title.indexOf("\n");
        const maxPositionInFirstLine =
            firstLineLength === -1 ? targetItem.title.length : firstLineLength;
        const selectionPosition = Math.min(desiredCaretPositionRef.current, maxPositionInFirstLine);
        setPendingFocus({
            id: targetItem.id,
            selectionStart: selectionPosition,
            selectionEnd: selectionPosition,
        });
    }

    function saveCaretPosition(event: SyntheticEvent<HTMLTextAreaElement>) {
        if (ignoreNextSelectionRef.current) {
            ignoreNextSelectionRef.current = false;
            return;
        }

        const { selectionDirection, selectionStart, selectionEnd } = event.currentTarget;
        const caretPosition = selectionDirection === "backward" ? selectionStart : selectionEnd;

        if (caretPosition == null) {
            return;
        }

        const lineStart = event.currentTarget.value.lastIndexOf("\n", caretPosition - 1) + 1;
        const nextDesiredCaretPosition = caretPosition - lineStart;
        desiredCaretPositionRef.current = nextDesiredCaretPosition;
    }

    function isCaretOnFirstLine(input: HTMLTextAreaElement) {
        const caretPosition = input.selectionStart ?? 0;
        return !input.value.slice(0, caretPosition).includes("\n");
    }

    function isCaretOnLastLine(input: HTMLTextAreaElement) {
        const caretPosition = input.selectionEnd ?? input.value.length;
        return !input.value.slice(caretPosition).includes("\n");
    }

    function handleItemKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, item: GroceryItem) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();

            let { selectionStart, selectionEnd } = event.currentTarget;

            if (!selectionStart || !selectionEnd) {
                selectionStart = selectionEnd = event.currentTarget.value.length;
            }

            const titleBefore = event.currentTarget.value.slice(0, selectionStart);
            const titleAfter = event.currentTarget.value.slice(selectionEnd);

            createItemAfter({
                id: item.id,
                checked: item.checked,
                titleBefore,
                titleAfter,
            });
        }

        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "l") {
            event.preventDefault();
            toggleChecked(item.id, !item.checked);
        }

        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const hasSelection =
                event.currentTarget.selectionStart !== event.currentTarget.selectionEnd;
            const shouldMoveToAdjacentItem =
                !hasSelection &&
                (event.key === "ArrowUp"
                    ? isCaretOnFirstLine(event.currentTarget)
                    : isCaretOnLastLine(event.currentTarget));

            if (!shouldMoveToAdjacentItem) {
                ignoreNextSelectionRef.current = true;
                return;
            }

            event.preventDefault();
            moveCaretBetweenItems({
                id: item.id,
                direction: event.key === "ArrowUp" ? "up" : "down",
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
            <ErrorToasts errors={errors} onClose={removeError} />
            <section className="editor">
                <h1 className="list-title">{NOTE_TITLE}</h1>

                {isLoading ? (
                    <p className="status">🔄 Loading...</p>
                ) : (
                    <div className="items">
                        {[...items]
                            .sort((first, second) => first.position - second.position)
                            .map((item) => (
                                <div className="item-row" key={tempIdsMap.get(item.id) || item.id}>
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
                                    <label className="item-textarea-label">
                                        <textarea
                                            id={`input-${item.id}`}
                                            className={`item-input${item.checked ? " is-checked" : ""}`}
                                            ref={(node) => {
                                                if (node) {
                                                    inputRefs.current.set(item.id, node);
                                                    resizeTextarea(node);
                                                } else {
                                                    inputRefs.current.delete(item.id);
                                                }
                                            }}
                                            onBlur={(event) => {
                                                updateItem(item.id, { title: event.target.value });
                                            }}
                                            onChange={(event) => {
                                                resizeTextarea(event.currentTarget);
                                                handleItemChange(item.id, event.target.value);
                                            }}
                                            onSelect={saveCaretPosition}
                                            onKeyDown={(event) => {
                                                handleItemKeyDown(event, item);
                                            }}
                                            rows={1}
                                            value={item.title}
                                        />
                                    </label>
                                    <span
                                        style={{
                                            color: "red",
                                        }}
                                    >
                                        {tempIdsMap.get(item.id) ?? "?"}
                                    </span>
                                    <span
                                        style={{
                                            color: "green",
                                        }}
                                    >
                                        {item.id}
                                    </span>
                                    <div
                                        aria-label={`Remove ${item.title || "item"}`}
                                        className="item-remove"
                                        onClick={() => {
                                            removeItem(item.id);
                                        }}
                                        role="button"
                                        tabIndex={0}
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
                            ➕ Item
                        </button>
                    </div>
                )}
            </section>
        </main>
    );
}
