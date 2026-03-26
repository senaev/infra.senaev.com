import "./App.css";

import { KeyboardEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { ErrorToasts } from "./components/ErrorToasts";
import { ITEM_COLUMNS, TABLE_NAME, TodoListTable } from "./Tables/TodoListTable";
import { TodoListItem } from "./TodoList/TodoList";
import { useTodoList } from "./TodoList/useTodoList";
import { supabase } from "./utils/supabase";

const debugEnabled = new URLSearchParams(window.location.search).has("debug");

type PendingFocus = {
    id: number;
    selectionStart: number;
    selectionEnd: number;
};

const TODO_LIST_ID = 1;

// Temp ids are used for optimistic rendering of newly created items
// They are also used when rendering items to avoid rerendering after getting real id
let nextTempId = -1;
const generateNextItemId = () => nextTempId--;
const tempIdsMap = new Map<number, number>();
const tempIdsRemovedSet = new Set<number>();
const tempUpdatesMap = new Map<
    number,
    Partial<Pick<TodoListItem, "title" | "position" | "checked">>
>();

export default function App() {
    const [items, todoList] = useTodoList(TODO_LIST_ID);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
    const inputRefs = useRef(new Map<number, HTMLTextAreaElement>());
    const desiredCaretPositionRef = useRef(0);
    const ignoreNextSelectionRef = useRef(false);

    const [errors, setErrors] = useState<string[]>([]);

    function showError(error: string) {
        console.error(error);
        setErrors((current) => [...current, error]);
    }

    function removeError(indexToRemove: number) {
        setErrors((current) => current.filter((_, index) => index !== indexToRemove));
    }

    useEffect(() => {
        setIsLoading(true);

        TodoListTable.getAllTodosForTodoList(TODO_LIST_ID)
            .then((data) => {
                todoList.setItems(data.map((item) => ({ ...item, persisted: true })));
            })
            .catch((error) => {
                showError(error.message);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [todoList]);

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

    function changeItemLocally(id: number, updates: Partial<TodoListItem>): void {
        todoList.setItems(
            todoList.getItems().map((item) => (item.id === id ? { ...item, ...updates } : item)),
        );
    }

    function persistItem(
        id: number,
        updates: Partial<Pick<TodoListItem, "title" | "position" | "checked">>,
    ): void {
        const itemToUpdate = todoList.getItems().find((item) => item.id === id);
        if (!itemToUpdate) {
            showError(`persistItem: item with id ${id} not found`);
            debugger;
            return;
        }

        const previousUpdateIndex = itemToUpdate.update_index;
        const nextUpdateIndex = previousUpdateIndex + 1;
        changeItemLocally(id, { update_index: nextUpdateIndex });

        if (id < 0) {
            tempUpdatesMap.set(id, { ...tempUpdatesMap.get(id), ...updates });
            return;
        }

        TodoListTable.updateTodoListItem(id, { ...updates, update_index: nextUpdateIndex })
            .then((result) => {
                if (result === "update_index_conflict") {
                    // Ignore conflicts, persistent state will be delivered through server-push
                    return;
                }

                // Check that local item has not been removed during update
                const localItem = todoList.getItems().find((item) => item.id === id);
                if (localItem) {
                    changeItemLocally(id, { persisted: true });
                }
            })
            .catch((error) => {
                showError(error.message);
            });
    }

    function resizeTextarea(input: HTMLTextAreaElement) {
        input.style.height = "auto";
        input.style.height = `${input.scrollHeight}px`;
    }

    function removeItemLocally(id: number): void {
        const itemToRemove = todoList.getItems().find((item) => item.id === id);

        if (!itemToRemove) {
            showError(`removeItem: item with id ${id} not found`);
            return;
        }

        todoList.setItems(todoList.getItems().filter((item) => item.id !== id));
    }

    function removeItemRemotely(id: number): void {
        if (id < 0) {
            // Item has NOT been persisted yet, add to list to remove after persistence
            tempIdsRemovedSet.add(id);
            return;
        }

        supabase
            .from(TABLE_NAME)
            .delete()
            .eq("id", id)
            .then((result) => {
                if (result.error) {
                    showError(`deleteItem(${id}): ${result.error.message}`);
                }
            });
    }

    function removeItem(id: number) {
        removeItemLocally(id);
        removeItemRemotely(id);
    }

    function createItem() {
        const nextPosition = Math.max(...todoList.getItems().map((item) => item.position), 0) + 1;
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
        const itemsWithHigherPosition = todoList
            .getItems()
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
            todoList.setItems(
                todoList.getItems().map((item) => {
                    if (item.id === id) {
                        return { ...item, position: nextPosition, persisted: false };
                    }

                    return item;
                }),
            );

            persistItem(id, { position: nextPosition });
        });

        const tempId = generateNextItemId();

        const newItem: TodoListItem = {
            id: tempId,
            todo_list_id: TODO_LIST_ID,
            title,
            created: "",
            updated: "",
            position,
            checked,
            update_index: 0,
            persisted: false,
        };

        todoList.setItems([...todoList.getItems(), newItem]);

        setPendingFocus({
            id: tempId,
            selectionStart: 0,
            selectionEnd: 0,
        });

        supabase
            .from(TABLE_NAME)
            .insert({
                todo_list_id: newItem.todo_list_id,
                title: newItem.title,
                position: newItem.position,
                checked: newItem.checked,
                update_index: newItem.update_index,
            })
            .select(ITEM_COLUMNS)
            .single()
            .then(({ data, error }) => {
                if (error) {
                    showError(`insertItemAtPosition: ${error.message}`);
                    return;
                }

                if (tempIdsRemovedSet.delete(tempId)) {
                    removeItemRemotely(data.id);
                    return;
                }

                tempIdsMap.set(data.id, tempId);

                const tempUpdate = tempUpdatesMap.get(tempId);
                changeItemLocally(tempId, {
                    id: data.id,
                    created: data.created,
                    updated: data.updated,
                    persisted: !tempUpdate,
                });
                if (tempUpdate) {
                    tempUpdatesMap.delete(tempId);
                    persistItem(data.id, tempUpdate);
                }
            });
    }

    function updateItem(id: number, params: { title?: string; checked?: boolean }) {
        const itemToUpdate = todoList.getItems().find((item) => item.id === id);

        if (!itemToUpdate) {
            showError(`updateItem: item not found id=[${id}]`);
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

        changeItemLocally(id, { ...params, persisted: false });
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
        const currentItem = todoList.getItems().find((item) => item.id === id);

        if (!currentItem) {
            showError(`createItemAfter: item with id ${id} not found`);
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
        todoList.setItems(
            todoList
                .getItems()
                .map((item) => (item.id === id ? { ...item, checked: isChecked } : item)),
        );
        persistItem(id, { checked: isChecked });
    }

    function mergeItemWithPrevious(id: number) {
        const sortedItems = [...todoList.getItems()].sort(
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

        todoList.setItems(
            todoList.getItems().map((item) => {
                if (item.id === previousItem.id) {
                    return { ...item, title: mergedTitle };
                }

                return item;
            }),
        );

        persistItem(previousItem.id, { title: mergedTitle });
        removeItemLocally(currentItem.id);
        removeItemRemotely(currentItem.id);
        setPendingFocus({
            id: previousItem.id,
            selectionStart: cursorPosition,
            selectionEnd: cursorPosition,
        });
    }

    function moveCaretBetweenItems({ id, direction }: { id: number; direction: "up" | "down" }) {
        const sortedItems = [...todoList.getItems()].sort(
            (first, second) => first.position - second.position,
        );
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

    function handleItemKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, item: TodoListItem) {
        let { selectionStart, selectionEnd } = event.currentTarget;
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();

            if (selectionStart == null || selectionEnd == null) {
                showError("Unable to determine caret position");
                return;
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
            const hasSelection = selectionStart !== selectionEnd;
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

        if (event.key === "Backspace" && selectionStart === 0 && selectionEnd === 0) {
            event.preventDefault();

            mergeItemWithPrevious(item.id);
        }
    }

    function handleItemChange(id: number, title: string) {
        changeItemLocally(id, { title, persisted: false });
        persistItem(id, { title });
    }

    return (
        <main className="page">
            <ErrorToasts errors={errors} onClose={removeError} />
            <section className="editor">
                <h1 className="list-title">{todoList.getTitle()}</h1>

                {isLoading ? (
                    <p className="status">🔄 Loading...</p>
                ) : (
                    <div className="items">
                        {[...todoList.getItems()]
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
                                    {debugEnabled && (
                                        <>
                                            <span>{item.position}</span>
                                            <span>{item.persisted ? "✅" : "⏳"}</span>
                                            <span
                                                style={{
                                                    color: "blue",
                                                }}
                                            >
                                                {item.update_index}
                                            </span>
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
                                        </>
                                    )}
                                    <div
                                        aria-label={`Remove ${item.title || "item"}`}
                                        className="item-remove"
                                        onClick={() => {
                                            removeItem(item.id);
                                        }}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="item-remove-visual" />
                                    </div>
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
