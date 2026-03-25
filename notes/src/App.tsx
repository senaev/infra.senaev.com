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

export default function App() {
    const [items, setItems] = useState<GroceryItem[]>([]);
    const [draftTitle, setDraftTitle] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadItems() {
            setIsLoading(true);
            setError(null);

            const result = await supabase
                .from("grocery_items")
                .select("id, title, created, bought, deleted")
                .is("deleted", null)
                .order("created", { ascending: true });

            if (result.error) {
                setError(result.error.message);
            } else {
                setItems(result.data ?? []);
            }

            setIsLoading(false);
        }

        void loadItems();
    }, []);

    async function createItem() {
        const nextTitle = draftTitle.trim();
        if (!nextTitle) {
            return;
        }

        setError(null);

        const result = await supabase
            .from("grocery_items")
            .insert({ title: nextTitle })
            .select("id, title, created, bought, deleted")
            .single();

        if (result.error) {
            setError(result.error.message);
            return;
        }

        if (result.data) {
            setItems((current) => [...current, result.data]);
            setDraftTitle("");
        }
    }

    function updateItem(id: number, title: string) {
        console.log("updateItem", { id, title });
        const nextTitle = title.trim();

        supabase
            .from("grocery_items")
            .update({ title: nextTitle })
            .eq("id", id)
            .select("id, title, created, bought, deleted")
            .single()
            .then((result) => {
                if (result.error) {
                    setError(result.error.message);
                    return;
                }

                if (result.data) {
                    setItems((current) =>
                        current.map((item) => {
                            if (item.id === id) {
                                return result.data;
                            }

                            return item;
                        }),
                    );
                }
            });
    }

    function removeItem(id: number) {
        setError(null);

        const deleted = new Date().toISOString();
        supabase
            .from("grocery_items")
            .update({ deleted })
            .eq("id", id)
            .select("id")
            .single()
            .then((result) => {
                if (result.error) {
                    setError(result.error.message);
                    return;
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

                {error ? <p className="status error">{error}</p> : null}
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
                                    aria-label={`Remove ${item.title}`}
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

                        <div className="item-row item-row-draft">
                            <input
                                className="item-input"
                                onBlur={() => void createItem()}
                                onChange={(event) => setDraftTitle(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        void createItem();
                                    }
                                }}
                                placeholder="+ List item"
                                value={draftTitle}
                            />
                        </div>
                    </div>
                )}
            </section>
        </main>
    );
}
