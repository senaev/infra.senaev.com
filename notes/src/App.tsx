import "./App.css";

import { KeyboardEvent, useEffect, useState } from "react";
import { supabase } from "./utils/supabase";

type GroceryItem = {
    id: number;
    title: string;
    created: string;
    bought: string | null;
    deleted: string | null;
};

const NOTE_TITLE = "Groceries 🛒";
const TABLE_NAME = "grocery_items";

let newItemId = -1;
const generateNewItemId = () => --newItemId;

export default function App() {
    const [items, setItems] = useState<GroceryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [errors, setErrors] = useState<string[]>([]);
    function addError(error: string) {
        setErrors((current) => [...current, error]);
    }

    useEffect(() => {
        setIsLoading(true);

        supabase
            .from(TABLE_NAME)
            .select("id, title, created, bought, deleted")
            .is("deleted", null)
            .order("created", { ascending: true })
            .then((result) => {
                if (result.error) {
                    addError(result.error.message);
                } else {
                    setItems(result.data ?? []);
                }

                setIsLoading(false);
            });
    }, []);

    function createItem() {
        const id = generateNewItemId();
        setItems((current) => [
            ...current,
            {
                id,
                title: "",
                created: new Date().toISOString(),
                bought: null,
                deleted: null,
            },
        ]);

        supabase
            .from(TABLE_NAME)
            .insert({ title: "" })
            .select("id, title, created, bought, deleted")
            .single()
            .then((result) => {
                if (result.error) {
                    addError(result.error.message);
                    return;
                }

                if (result.data) {
                    setItems((current) =>
                        current.map((item) => (item.id === id ? result.data : item)),
                    );
                }
            });
    }

    function updateItem(id: number, title: string) {
        supabase
            .from(TABLE_NAME)
            .update({ title })
            .eq("id", id)
            .select("id, title, created, bought, deleted")
            .single()
            .then((result) => {
                if (result.error) {
                    addError(result.error.message);
                    return;
                }

                if (result.data) {
                    setItems((current) =>
                        current.map((item) => (item.id === id ? result.data : item)),
                    );
                }
            });
    }

    function removeItem(id: number) {
        const deleted = new Date().toISOString();
        supabase
            .from(TABLE_NAME)
            .update({ deleted })
            .eq("id", id)
            .select("id")
            .single()
            .then((result) => {
                if (result.error) {
                    addError(result.error.message);
                }
            });

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
                        <div>{errors}</div>
                    </p>
                ) : null}

                {isLoading ? (
                    <p className="status">Loading...</p>
                ) : (
                    <div className="items">
                        {items.map((item) => (
                            <div className="item-row" key={item.id}>
                                <input
                                    className="item-input"
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
                                >
                                    +
                                </button>
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
