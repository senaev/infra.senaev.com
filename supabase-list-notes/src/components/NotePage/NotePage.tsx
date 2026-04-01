import "./NotePage.css";

import { KeyboardEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { flattenGroups } from "../../Note/Note";
import { useNote } from "../../Note/useNote";
import { useErrorsContext } from "../../contexts/ErrorsContext";
import { NoteItemsTable } from "../../tables/NoteItemsTable";
import { NoteItem } from "../../types/NoteItem";
import { captureDragAndDrop } from "../../utils/captureDragAndDrop";
import { noop } from "../../utils/noop";
import { NoteItemElement } from "../NoteItemElement/NoteItemElement";

const PLACEHOLDER_ITEM_ID = -1_000_000_000;

const CHILD_OFFSET = 25;

type DragState = {
    sourceIndex: number;
    sourceCount: number;
    dropIndex: number;
    child: boolean;
    x: number;
    y: number;
};

export function NotePage({
    noteId,
}: {
    noteId: number;
}) {
    const { showError } = useErrorsContext();
    const [itemsVer, list] = useNote({ listId: noteId, showError });
    const [dragState, setDragState] = useState<DragState | null>(null);
    const inputRefs = useRef(new Map<number, HTMLTextAreaElement>());
    const desiredCaretPositionRef = useRef(0);
    const ignoreNextSelectionRef = useRef(false);
    const itemsContainerRef = useRef<HTMLDivElement>(null);
    const itemsContainer = itemsContainerRef.current!;

    const parentGroups = list.getItemGroupsSplit();
    const unchecked = flattenGroups(parentGroups.unchecked);
    const checked = flattenGroups(parentGroups.checked);

    useEffect(() => {
        if (list.pendingFocus == null) {
            return;
        }

        const { selectionEnd, selectionStart, id } = list.pendingFocus;

        const input = inputRefs.current.get(id);
        if (!input) {
            return;
        }

        ignoreNextSelectionRef.current = true;
        input.focus();
        input.setSelectionRange(selectionStart, selectionEnd);
        list.setPendingFocus(null);
    }, [itemsVer, list]);

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
        const parentGroups = list.getItemGroupsSplit();
        const unchecked = flattenGroups(parentGroups.unchecked);
        const checked = flattenGroups(parentGroups.checked);

        const sortedItems = unchecked.find((item) => item.id === id) ? unchecked : checked;

        const currentIndex = sortedItems.findIndex((item) => item.id === id);

        if (currentIndex === -1) {
            showError("Unable to find item to move caret from");
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
        list.setPendingFocus({
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

    function handleItemKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, item: NoteItem) {
        let { selectionStart, selectionEnd } = event.currentTarget;
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();

            if (selectionStart == null || selectionEnd == null) {
                showError("Unable to determine caret position");
                return;
            }

            list.createItemAfter({
                id: item.id,
                selectionStart,
                selectionEnd,
            });
        }

        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "l") {
            event.preventDefault();
            list.toggleChecked(item.id, !item.check_time);
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

            list.mergeItemWithPrevious(item.id);
        }
    }

    function handleItemChange(id: number, title: string) {
        list.changeItemLocally(id, { title, persisted: false });
        list.persistItem(id, { title });
    }

    type ListItemWithSortedIndex = NoteItem & {
        sortedIndex: number;
    };
    const sortedItemsWithPlaceholders: ListItemWithSortedIndex[] = [
        ...unchecked.map((item, index) => ({ ...item, sortedIndex: index })),
    ];
    if (dragState) {
        const { sourceIndex, sourceCount, dropIndex } = dragState;
        if (dropIndex !== sourceIndex) {
            Array.from({ length: sourceCount }).forEach((_, i) => {
                const placeholder: ListItemWithSortedIndex = {
                    ...unchecked[sourceIndex + i],
                    id: PLACEHOLDER_ITEM_ID - i,
                    sortedIndex: -1,
                };
                const placeholderIndex =
                    dropIndex > sourceIndex ? dropIndex + sourceCount : dropIndex;
                sortedItemsWithPlaceholders.splice(placeholderIndex, 0, placeholder);
            });
        }
    }

    return (
        <>
            <div className="NotePage__items" ref={itemsContainerRef}>
                {sortedItemsWithPlaceholders.map((item) => (
                    <NoteItemElement
                        key={list.getItemClientKey(item)}
                        item={item}
                        toggleChecked={(checked) => {
                            list.toggleChecked(item.id, checked);
                        }}
                        onChange={(value) => {
                            handleItemChange(item.id, value);
                        }}
                        onKeyDown={(event) => {
                            handleItemKeyDown(event, item);
                        }}
                        onTextSelectionChange={saveCaretPosition}
                        onRemove={() => {
                            list.removeItem(item.id);
                        }}
                        dragState={(() => {
                            if (!dragState) {
                                return undefined;
                            }

                            if (item.id <= PLACEHOLDER_ITEM_ID) {
                                return "placeholder";
                            }

                            const { sourceIndex, sourceCount, dropIndex } = dragState;
                            if (item.sortedIndex >= 0) {
                                if (
                                    item.sortedIndex < sourceIndex ||
                                    item.sortedIndex >= sourceIndex + sourceCount
                                ) {
                                    return undefined;
                                }
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
                            const initialCursorOffset = {
                                x: event.clientX - itemsContainerRect.left,
                                y: event.clientY - itemsContainerRect.top,
                            };

                            const initialItemContainerOffsetY =
                                dragItemRect.top - itemsContainerRect.top;

                            const sourceIndex = unchecked.findIndex((i) => i.id === item.id);
                            let sourceCount = 1;
                            if (!item.child) {
                                for (let i = sourceIndex + 1; i < unchecked.length; i++) {
                                    if (unchecked[i].child) {
                                        sourceCount++;
                                    } else {
                                        break;
                                    }
                                }
                            }

                            const otherItemsVerticalCenters: number[] = [];
                            const itemElements = Array.from(
                                itemsContainer.querySelectorAll(".item-row"),
                            );
                            let movingItemsHeight = 0;
                            itemElements.forEach((otherItemElement, i) => {
                                const rect = otherItemElement.getBoundingClientRect();
                                if (i >= sourceIndex && i < sourceIndex + sourceCount) {
                                    movingItemsHeight += rect.height;
                                    return;
                                }

                                let center = rect.top + rect.height / 2 - itemsContainerRect.top;

                                if (i > sourceIndex) {
                                    center -= movingItemsHeight;
                                }

                                otherItemsVerticalCenters.push(center);
                            });

                            let dragState: DragState = {
                                sourceIndex,
                                sourceCount,
                                dropIndex: sourceIndex,
                                child: item.child,
                                x: dragItemRect.left - itemsContainerRect.left,
                                y: dragItemRect.top - itemsContainerRect.top,
                            };
                            setDragState(dragState);

                            captureDragAndDrop(event.nativeEvent, (event, isStop) => {
                                if (isStop) {
                                    setDragState(null);

                                    const { dropIndex, child } = dragState;
                                    list.moveItems(item.id, {
                                        dropIndex:
                                            dropIndex > sourceIndex
                                                ? dropIndex + sourceCount
                                                : dropIndex,
                                        child,
                                        count: sourceCount,
                                    });

                                    return;
                                }

                                const itemsContainerRect = itemsContainer.getBoundingClientRect();
                                const offset = {
                                    x: event.clientX - itemsContainerRect.left,
                                    y: event.clientY - itemsContainerRect.top,
                                };

                                const dropIndex = (() => {
                                    const moveOffset =
                                        offset.y -
                                        initialCursorOffset.y +
                                        initialItemContainerOffsetY;

                                    for (let i = 0; i < otherItemsVerticalCenters.length; i++) {
                                        const center = otherItemsVerticalCenters[i];
                                        if (moveOffset < center) {
                                            return i;
                                        }
                                    }

                                    return otherItemsVerticalCenters.length;
                                })();

                                const dragRight = offset.x - cursorToDragElementOffset.x;
                                const child: boolean = (() => {
                                    if (dragRight >= CHILD_OFFSET) {
                                        return true;
                                    }

                                    if (dragRight < -CHILD_OFFSET) {
                                        return false;
                                    }

                                    return item.child;
                                })();

                                const nextDragState: DragState = {
                                    sourceIndex,
                                    sourceCount,
                                    dropIndex,
                                    child,
                                    x: offset.x - cursorToDragElementOffset.x,
                                    y: offset.y - cursorToDragElementOffset.y,
                                };

                                dragState = nextDragState;
                                setDragState(nextDragState);
                            });
                        }}
                        resizeTextarea={resizeTextarea}
                        inputRefs={inputRefs}
                        readonlyText={false}
                    />
                ))}
                <button
                    className="add-item-button"
                    onClick={() => {
                        list.createNewItemAtTheEnd();
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
                        {[...Array.from({ length: dragState.sourceCount }, (_, i) => i)].map(
                            (i) => {
                                const item = unchecked[dragState.sourceIndex + i];
                                const child: boolean = (() => {
                                    if (i > 0) {
                                        return true;
                                    }

                                    if (dragState.dropIndex === 0) {
                                        return false;
                                    }

                                    if (dragState.child) {
                                        return true;
                                    }

                                    return false;
                                })();

                                return (
                                    <NoteItemElement
                                        key={i}
                                        dragState="overlay"
                                        inputRefs={inputRefs}
                                        item={{
                                            ...item,
                                            child,
                                        }}
                                        onChange={noop}
                                        onKeyDown={noop}
                                        onRemove={noop}
                                        onTextSelectionChange={noop}
                                        onDragStart={noop}
                                        readonlyText
                                        resizeTextarea={resizeTextarea}
                                        toggleChecked={noop}
                                    />
                                );
                            },
                        )}
                    </div>
                ) : null}
            </div>
            <div>
                {checked.length > 0 && (
                    <>
                        <hr className="items-separator" />
                        {checked.map((item) => (
                            <NoteItemElement
                                key={list.getItemClientKey(item)}
                                item={item}
                                toggleChecked={(checked) => {
                                    list.toggleChecked(item.id, checked);
                                }}
                                onChange={noop}
                                onKeyDown={noop}
                                onTextSelectionChange={saveCaretPosition}
                                onRemove={() => {
                                    list.removeItem(item.id);
                                }}
                                dragState={undefined}
                                onDragStart={undefined}
                                resizeTextarea={noop}
                                inputRefs={inputRefs}
                                readonlyText={true}
                            />
                        ))}
                    </>
                )}
            </div>
        </>
    );
}
