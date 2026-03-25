import "./App.css";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { supabase } from "./utils/supabase";

type GroceryItem = {
    id: number;
    title: string;
    position: number;
    created: string;
    updated: string;
    bought: string | null;
    deleted: string | null;
};

type PendingFocus = {
    id: number;
    selectionStart: number;
    selectionEnd: number;
};

const NOTE_TITLE = "Groceries 🛒";
const TABLE_NAME = "grocery_items";

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
            .select("id, title, position, created, updated, bought, deleted")
            .is("deleted", null)
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
        updates: Partial<Pick<GroceryItem, "title" | "position" | "bought" | "deleted">>,
    ): void {
        supabase
            .from(TABLE_NAME)
            .update(updates)
            .eq("id", id)
            .select("id, title, position, created, updated, bought, deleted")
            .single()
            .then((result) => {
                if (result.error) {
                    addError(`persistItem(${id}): ${result.error.message}`);
                    return null;
                }

                if (result.data) {
                    setItems((current) =>
                        current.map((item) => (item.id === id ? result.data : item)),
                    );
                }
            });
    }

    function createItem() {
        const nextPosition =
            items.reduce((maxPosition, item) => Math.max(maxPosition, item.position), 0) + 1;

        insertItem({ title: "", bought: null, position: nextPosition });
    }

    function insertItem({
        title,
        bought,
        position,
    }: {
        title: string;
        bought: string | null;
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
                bought,
                deleted: null,
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
            .insert({ title, position, bought })
            .select("id, title, position, created, updated, bought, deleted")
            .single()
            .then(({ data, error }) => {
                if (error) {
                    addError(`insertItemAtPosition: ${error.message}`);
                    return;
                }

                setItems((current) =>
                    current.map((item) => {
                        if (item.id !== tempId) {
                            return item;
                        }

                        clientIdsMap.set(data.id, tempId);
                        return data;
                    }),
                );
            });
    }

    function updateItemTitle(id: number, title: string) {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
        persistItem(id, { title });
    }

    function createItemAfter({
        id,
        bought,
        titleBefore,
        titleAfter,
    }: {
        id: number;
        bought: string | null;
        titleBefore: string;
        titleAfter: string;
    }) {
        const currentItem = items.find((item) => item.id === id);

        if (!currentItem) {
            addError(`createItemAfter: item with id ${id} not found`);
            return;
        }

        const nextPosition = currentItem.position + 1;

        updateItemTitle(id, titleBefore);
        insertItem({ title: titleAfter, bought, position: nextPosition });
    }

    function updateItem(id: number, title: string) {
        persistItem(id, { title });
    }

    function toggleBought(id: number, checked: boolean) {
        const bought = checked ? new Date().toISOString() : null;

        setItems((current) => current.map((item) => (item.id === id ? { ...item, bought } : item)));
        persistItem(id, { bought });
    }

    function removeItem(id: number) {
        const deleted = new Date().toISOString();
        persistItem(id, { deleted });

        setItems((current) => current.filter((item) => item.id !== id));
    }

    function handleItemKeyDown(event: KeyboardEvent<HTMLInputElement>, item: GroceryItem) {
        if (event.key === "Enter") {
            event.preventDefault();
            const cursorPosition =
                event.currentTarget.selectionStart ?? event.currentTarget.value.length;
            const titleBefore = event.currentTarget.value.slice(0, cursorPosition);
            const titleAfter = event.currentTarget.value.slice(cursorPosition);

            createItemAfter({ id: item.id, bought: item.bought, titleBefore, titleAfter });
        }

        if (event.key === "Backspace" && !event.currentTarget.value) {
            event.preventDefault();
            removeItem(item.id);
        }
    }

    function handleItemChange(id: number, title: string) {
        setItems((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
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
                                            aria-label={`Mark ${item.title || "item"} as bought`}
                                            checked={Boolean(item.bought)}
                                            className="item-checkbox"
                                            onChange={(event) => {
                                                toggleBought(item.id, event.target.checked);
                                            }}
                                            type="checkbox"
                                        />
                                    </label>
                                    <input
                                        id={`input-${item.id}`}
                                        className={`item-input${item.bought ? " is-bought" : ""}`}
                                        ref={(node) => {
                                            if (node) {
                                                inputRefs.current.set(item.id, node);
                                            } else {
                                                inputRefs.current.delete(item.id);
                                            }
                                        }}
                                        onBlur={(event) => {
                                            updateItem(item.id, event.target.value);
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
