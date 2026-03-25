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

const NOTE_TITLE = "Groceries 🛒";
const TABLE_NAME = "grocery_items";

let newItemId = -1;
const generateNewItemId = () => --newItemId;
const clientIdsMap = new Map<number, number>();

let maxExistingPosition = 0;
const MAX_EXISTING_POSITION = {
    set: (next: number): void => {
        maxExistingPosition = Math.max(maxExistingPosition, next);
    },
    get: (): number => maxExistingPosition,
    new: (): number => {
        const position = MAX_EXISTING_POSITION.get() + 2048;
        MAX_EXISTING_POSITION.set(position);
        return position;
    },
};

export default function App() {
    const [items, setItems] = useState<GroceryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);
    const inputRefs = useRef(new Map<number, HTMLInputElement>());

    const [errors, setErrors] = useState<string[]>([]);
    function addError(error: string) {
        setErrors((current) => [...current, error]);
    }

    items.forEach((item) => {
        MAX_EXISTING_POSITION.set(item.position);
    });

    useEffect(() => {
        setIsLoading(true);

        supabase
            .from(TABLE_NAME)
            .select("id, title, position, created, updated, bought, deleted")
            .is("deleted", null)
            .order("created", { ascending: true })
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
        if (pendingFocusId == null) {
            return;
        }

        const input = inputRefs.current.get(pendingFocusId);
        if (!input) {
            return;
        }

        input.focus();
        setPendingFocusId(null);
    }, [items, pendingFocusId]);

    function persistItem(
        id: number,
        updates: Partial<Pick<GroceryItem, "title" | "bought" | "deleted">>,
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
        const tempId = generateNewItemId();
        const position = MAX_EXISTING_POSITION.new();
        const created = new Date().toISOString();

        setItems((current) => [
            ...current,
            {
                id: tempId,
                title: "",
                created,
                updated: created,
                position,
                bought: null,
                deleted: null,
            },
        ]);
        setPendingFocusId(tempId);

        supabase
            .from(TABLE_NAME)
            .insert({ title: "", position })
            .select("id, title, position, created, updated, bought, deleted")
            .single()
            .then(({ data, error }) => {
                if (error) {
                    addError(`createItem: ${error.message}`);
                    return;
                }

                let title = data.title;
                let bought = data.bought;

                setItems((current) =>
                    current.map((item) => {
                        if (item.id !== tempId) {
                            return item;
                        }

                        clientIdsMap.set(data.id, tempId);
                        return data;
                    }),
                );

                if (title !== data.title || bought !== data.bought) {
                    persistItem(data.id, { title, bought });
                }
            });
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
            event.currentTarget.blur();
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
                        {items.map((item) => (
                            <div className="item-row" key={clientIdsMap.get(item.id) || item.id}>
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
