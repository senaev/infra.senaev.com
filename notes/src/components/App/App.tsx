import "./App.css";

import { KeyboardEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { useTodoList } from "../../TodoList/useTodoList";
import { TodoListItem } from "../../types/TodoListItem";
import { noop } from "../../utils/noop";
import { startDragAndDrop } from "../../utils/startDragAndDrop";
import { ErrorToasts } from "../ErrorToasts/ErrorToasts";
import { ListItem } from "../ListItem/ListItem";

const TODO_LIST_ID = 1;

const PLACEHOLDER_ITEM_ID = -1_000_000_000;

const CHILD_OFFSET = 25;

type DragState = {
    sourceIndex: number;
    dropIndex: number;
    childCandidate: boolean;
    x: number;
    y: number;
};

export function App() {
    const [itemsVer, todoList] = useTodoList(TODO_LIST_ID);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const inputRefs = useRef(new Map<number, HTMLTextAreaElement>());
    const desiredCaretPositionRef = useRef(0);
    const ignoreNextSelectionRef = useRef(false);
    const itemsContainerRef = useRef<HTMLDivElement>(null);
    const itemsContainer = itemsContainerRef.current!;

    const sortedItems: TodoListItem[] = [...todoList.getItems()].sort(
        (first, second) => first.position - second.position,
    );

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

    const sortedItemsWithPlaceholder = [...sortedItems];
    if (dragState) {
        const { sourceIndex, dropIndex } = dragState;
        if (dropIndex !== sourceIndex) {
            const placeholder = {
                ...sortedItems[sourceIndex],
                id: PLACEHOLDER_ITEM_ID,
            };
            sortedItemsWithPlaceholder.splice(dropIndex, 0, placeholder);
        }
    }

    return (
        <main className="page">
            <ErrorToasts errors={todoList.errors} onClose={todoList.removeError} />
            <section className="editor">
                <h1 className="list-title">{todoList.getTitle()}</h1>

                <div className="items" ref={itemsContainerRef}>
                    {sortedItemsWithPlaceholder.map((item) => (
                        <ListItem
                            key={todoList.getItemClientKey(item)}
                            item={item}
                            toggleChecked={(checked) => {
                                todoList.toggleChecked(item.id, checked);
                            }}
                            onChange={(value) => {
                                handleItemChange(item.id, value);
                            }}
                            onKeyDown={(event) => {
                                handleItemKeyDown(event, item);
                            }}
                            onSelect={saveCaretPosition}
                            onRemove={() => {
                                todoList.removeItem(item.id);
                            }}
                            dragState={(() => {
                                if (!dragState) {
                                    return undefined;
                                }

                                if (item.id === PLACEHOLDER_ITEM_ID) {
                                    return "placeholder";
                                }

                                const { sourceIndex, dropIndex } = dragState;
                                if (sortedItems[sourceIndex].id !== item.id) {
                                    return undefined;
                                }

                                if (dropIndex === sourceIndex) {
                                    return "source";
                                }

                                return "source-collapsed";
                            })()}
                            onDragStart={(event) => {
                                const dragElement = event.target as HTMLElement;
                                const dragItemElement = dragElement.closest(".item-row")!;

                                const dragItemRect = dragItemElement.getBoundingClientRect();

                                const cursorToDragElementOffset = {
                                    x: event.clientX - dragItemRect.left,
                                    y: event.clientY - dragItemRect.top,
                                };

                                const itemsContainerRect = itemsContainer.getBoundingClientRect();
                                const initialCursorOffsetY = event.clientY - itemsContainerRect.top;

                                const initialItemContainerOffsetY =
                                    dragItemRect.top - itemsContainerRect.top;

                                const otherItemsVerticalCenters: number[] = [];

                                const sourceIndex = sortedItems.findIndex((i) => i.id === item.id);
                                const itemElements = Array.from(
                                    itemsContainer.querySelectorAll(".item-row"),
                                );
                                itemElements.forEach((otherItemElement, i) => {
                                    const rect = otherItemElement.getBoundingClientRect();
                                    if (i === sourceIndex) {
                                        return;
                                    }

                                    let center =
                                        rect.top + rect.height / 2 - itemsContainerRect.top;

                                    if (i > sourceIndex) {
                                        center -= dragItemRect.height;
                                    }

                                    otherItemsVerticalCenters.push(center);
                                });

                                let dragState: DragState = {
                                    sourceIndex,
                                    dropIndex: sourceIndex,
                                    childCandidate: item.parent_id != null,
                                    x: dragItemRect.left - itemsContainerRect.left,
                                    y: dragItemRect.top - itemsContainerRect.top,
                                };
                                setDragState(dragState);

                                startDragAndDrop(event.nativeEvent, (event, isStop) => {
                                    if (isStop) {
                                        setDragState(null);
                                        return;
                                    }

                                    const editorOffsetX = itemsContainer.offsetLeft;
                                    const offsetX = dragState.x - editorOffsetX;

                                    const childCandidate: boolean = offsetX >= CHILD_OFFSET;

                                    const itemsContainerRect =
                                        itemsContainer.getBoundingClientRect();
                                    const dropIndex = (() => {
                                        const moveOffset =
                                            event.clientY -
                                            itemsContainerRect.top -
                                            initialCursorOffsetY +
                                            initialItemContainerOffsetY;

                                        for (let i = 0; i < otherItemsVerticalCenters.length; i++) {
                                            const center = otherItemsVerticalCenters[i];
                                            if (moveOffset < center) {
                                                if (i < sourceIndex) {
                                                    return i;
                                                } else {
                                                    return i + 1;
                                                }
                                            }
                                        }

                                        return otherItemsVerticalCenters.length + 1;
                                    })();

                                    const nextDragState: DragState = {
                                        sourceIndex,
                                        dropIndex,
                                        childCandidate,
                                        x:
                                            event.clientX -
                                            itemsContainerRect.left -
                                            cursorToDragElementOffset.x,
                                        y:
                                            event.clientY -
                                            itemsContainerRect.top -
                                            cursorToDragElementOffset.y,
                                    };

                                    dragState = nextDragState;
                                    setDragState(nextDragState);
                                });
                            }}
                            resizeTextarea={resizeTextarea}
                            inputRefs={inputRefs}
                            readonly={false}
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

                    {dragState ? (
                        <div
                            className={"drag-overlay"}
                            style={{
                                transform: `translateY(${dragState.y}px)`,
                            }}
                        >
                            <ListItem
                                dragState="overlay"
                                inputRefs={inputRefs}
                                item={{
                                    ...sortedItems[dragState.sourceIndex],
                                    // Simulate child item
                                    parent_id: dragState.childCandidate ? 1 : null,
                                }}
                                onChange={noop}
                                onKeyDown={noop}
                                onRemove={noop}
                                onSelect={noop}
                                onDragStart={noop}
                                readonly
                                resizeTextarea={resizeTextarea}
                                toggleChecked={noop}
                            />
                        </div>
                    ) : null}
                </div>
            </section>
        </main>
    );
}
