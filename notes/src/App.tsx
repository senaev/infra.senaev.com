import "./App.css";

import { KeyboardEvent, PointerEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { ErrorToasts } from "./components/ErrorToasts";
import { TodoListItem } from "./TodoList/TodoList";
import { useTodoList } from "./TodoList/useTodoList";

const debugEnabled = new URLSearchParams(window.location.search).has("debug");

const TODO_LIST_ID = 1;

type DragState = {
    itemId: number;
    pointerId: number;
    x: number;
    y: number;
    width: number;
    offsetX: number;
    offsetY: number;
};

export function ListItem({
    item,
    toggleChecked,
    onChange,
    onSelect,
    onKeyDown,
    onRemove,
    dragState,
    dragHandlers,
    resizeTextarea,
    inputRefs,
}: {
    item: TodoListItem;
    toggleChecked: (id: number, checked: boolean) => void;
    onChange: (id: number, value: string) => void;
    onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onRemove: VoidFunction;
    dragState: boolean;
    dragHandlers: {
        start: (event: PointerEvent<HTMLDivElement>, item: TodoListItem) => void;
        move: (event: PointerEvent<HTMLDivElement>, item: TodoListItem) => void;
        stop: (event: PointerEvent<HTMLDivElement>, item: TodoListItem) => void;
    };
    resizeTextarea: (input: HTMLTextAreaElement) => void;
    inputRefs: React.RefObject<Map<number, HTMLTextAreaElement>>;
}) {
    return (
        <div className={`item-row${dragState ? " item-row--drag-source" : ""}`}>
            <div
                aria-label={`Reorder ${item.title || "item"}`}
                className="item-drag-handle"
                onPointerCancel={(event) => {
                    dragHandlers.stop(event, item);
                }}
                onPointerDown={(event) => {
                    dragHandlers.start(event, item);
                }}
                onPointerMove={(event) => {
                    dragHandlers.move(event, item);
                }}
                onPointerUp={(event) => {
                    dragHandlers.stop(event, item);
                }}
            >
                <span className="item-drag-handle__visual" />
            </div>
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
                    onChange={(event) => {
                        resizeTextarea(event.currentTarget);
                        onChange(item.id, event.currentTarget.value);
                    }}
                    onSelect={onSelect}
                    onKeyDown={onKeyDown}
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
                onClick={onRemove}
                role="button"
                tabIndex={0}
            >
                <div className="item-remove-visual" />
            </div>
        </div>
    );
}

export function App() {
    const [itemsVer, todoList] = useTodoList(TODO_LIST_ID);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const inputRefs = useRef(new Map<number, HTMLTextAreaElement>());
    const desiredCaretPositionRef = useRef(0);
    const ignoreNextSelectionRef = useRef(false);
    const activeDragRef = useRef<{ itemId: number; pointerId: number } | null>(null);

    useEffect(() => {
        if (todoList.pendingFocus == null) {
            return;
        }

        const { selectionEnd, selectionStart, id } = todoList.pendingFocus;

        const input = inputRefs.current.get(id);
        if (!input) {
            return;
        }

        ignoreNextSelectionRef.current = true;
        input.focus();
        input.setSelectionRange(selectionStart, selectionEnd);
        todoList.setPendingFocus(null);
    }, [itemsVer, todoList]);

    useEffect(() => {
        inputRefs.current.forEach((input) => {
            resizeTextarea(input);
        });
    }, [itemsVer]);

    function resizeTextarea(input: HTMLTextAreaElement) {
        input.style.height = "auto";
        input.style.height = `${input.scrollHeight}px`;
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
        todoList.setPendingFocus({
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
                todoList.showError("Unable to determine caret position");
                return;
            }

            const titleBefore = event.currentTarget.value.slice(0, selectionStart);
            const titleAfter = event.currentTarget.value.slice(selectionEnd);

            todoList.createItemAfter({
                id: item.id,
                checked: item.checked,
                titleBefore,
                titleAfter,
            });
        }

        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "l") {
            event.preventDefault();
            todoList.toggleChecked(item.id, !item.checked);
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

            todoList.mergeItemWithPrevious(item.id);
        }
    }

    function handleItemChange(id: number, title: string) {
        todoList.changeItemLocally(id, { title, persisted: false });
        todoList.persistItem(id, { title });
    }

    const dragHandlers = {
        start(event: PointerEvent<HTMLDivElement>, item: TodoListItem) {
            const row = event.currentTarget.closest(".item-row");

            if (!(row instanceof HTMLDivElement)) {
                return;
            }

            const rect = row.getBoundingClientRect();
            activeDragRef.current = {
                itemId: item.id,
                pointerId: event.pointerId,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragState({
                itemId: item.id,
                pointerId: event.pointerId,
                x: rect.left,
                y: rect.top,
                width: rect.width,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
            });

            console.log("drag:start", {
                itemId: item.id,
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                x: event.clientX,
                y: event.clientY,
            });
        },

        move(event: PointerEvent<HTMLDivElement>, item: TodoListItem) {
            if (
                activeDragRef.current == null ||
                activeDragRef.current.itemId !== item.id ||
                activeDragRef.current.pointerId !== event.pointerId
            ) {
                return;
            }

            setDragState((current) => {
                if (current == null) {
                    return null;
                }

                return {
                    ...current,
                    x: event.clientX - current.offsetX,
                    y: event.clientY - current.offsetY,
                };
            });

            console.log("drag:move", {
                itemId: item.id,
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                x: event.clientX,
                y: event.clientY,
            });
        },
        stop(event: PointerEvent<HTMLDivElement>, item: TodoListItem) {
            if (
                activeDragRef.current == null ||
                activeDragRef.current.itemId !== item.id ||
                activeDragRef.current.pointerId !== event.pointerId
            ) {
                return;
            }

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }

            activeDragRef.current = null;
            setDragState(null);

            console.log("drag:stop", {
                itemId: item.id,
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                x: event.clientX,
                y: event.clientY,
            });
        },
    };

    function renderDragOverlayItem(item: TodoListItem) {
        return (
            <div className="item-row item-row--drag-overlay">
                <div className="item-drag-handle">
                    <span className="item-drag-handle__visual" />
                </div>
                <label className="item-checkbox-label">
                    <input
                        checked={Boolean(item.checked)}
                        className="item-checkbox"
                        readOnly
                        type="checkbox"
                    />
                </label>
                <div className="item-textarea-label">
                    <div
                        className={`item-input item-input--drag-ghost${item.checked ? " is-checked" : ""}`}
                    >
                        {item.title || " "}
                    </div>
                </div>
                <div className="item-remove">
                    <div className="item-remove-visual" />
                </div>
            </div>
        );
    }

    const sortedItems = [...todoList.getItems()].sort(
        (first, second) => first.position - second.position,
    );
    const draggedItem = dragState
        ? (sortedItems.find((item) => item.id === dragState.itemId) ?? null)
        : null;

    return (
        <main className="page">
            <ErrorToasts errors={todoList.errors} onClose={todoList.removeError} />
            <section className="editor">
                <h1 className="list-title">{todoList.getTitle()}</h1>

                {todoList.isLoading ? (
                    <p className="status">🔄 Loading...</p>
                ) : (
                    <div className="items">
                        {sortedItems.map((item) => (
                            <ListItem
                                key={todoList.getItemClientKey(item)}
                                item={item}
                                toggleChecked={(id, checked) => {
                                    todoList.toggleChecked(id, checked);
                                }}
                                onChange={(id, value) => {
                                    handleItemChange(id, value);
                                }}
                                onKeyDown={(event) => {
                                    handleItemKeyDown(event, item);
                                }}
                                onSelect={saveCaretPosition}
                                onRemove={() => {
                                    todoList.removeItem(item.id);
                                }}
                                dragState={dragState?.itemId === item.id}
                                dragHandlers={dragHandlers}
                                resizeTextarea={resizeTextarea}
                                inputRefs={inputRefs}
                            />
                        ))}
                        <button
                            className="add-item-button"
                            onClick={() => {
                                todoList.createItem();
                            }}
                            type="button"
                        >
                            ➕ Item
                        </button>
                    </div>
                )}
            </section>
            {dragState && draggedItem ? (
                <div
                    className="drag-overlay"
                    style={{
                        transform: `translate(${dragState.x}px, ${dragState.y}px)`,
                        width: `${dragState.width}px`,
                    }}
                >
                    {renderDragOverlayItem(draggedItem)}
                </div>
            ) : null}
        </main>
    );
}
