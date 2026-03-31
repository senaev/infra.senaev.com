import classNames from "classnames";
import { KeyboardEvent, PointerEvent, SyntheticEvent } from "react";
import { DEBUG_ENABLED } from "../../const/DEBUG_ENABLED";
import { NoteItem } from "../../types/NoteItem";

type DragState = "overlay" | "source" | "source-collapsed" | "placeholder";

const DRAG_STATE_CLASSES: Record<DragState, string[]> = {
    overlay: ["item-row--drag-overlay"],
    source: ["item-row--drag-source"],
    "source-collapsed": ["item-row--drag-source", "item-row--drag-collapsed"],
    placeholder: ["item-row--drag-source"],
};

export type DragStartCallback = (event: PointerEvent<HTMLDivElement>) => void;

export function NoteItemElement({
    item,
    toggleChecked,
    onChange,
    onKeyDown,
    onRemove,
    dragState,
    onDragStart,
    resizeTextarea,
    inputRefs,
    onTextSelectionChange,
    readonlyText,
}: {
    item: NoteItem;
    toggleChecked: (checked: boolean) => void;
    onChange: (value: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onRemove: VoidFunction;
    dragState: DragState | undefined;
    onDragStart: DragStartCallback | undefined;
    resizeTextarea: (input: HTMLTextAreaElement) => void;
    inputRefs: React.RefObject<Map<number, HTMLTextAreaElement>>;
    readonlyText: boolean;
    onTextSelectionChange: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
}) {
    return (
        <div
            className={classNames("item-row", DRAG_STATE_CLASSES[dragState as DragState], {
                "item-row--child": item.child,
                "is-checked": Boolean(item.check_time),
            })}
        >
            <div
                className={classNames("item-drag-handle", {
                    "item-drag-handle--disabled": !onDragStart,
                })}
                role={onDragStart ? "button" : undefined}
                tabIndex={onDragStart ? 0 : undefined}
                onPointerDown={onDragStart}
                onContextMenu={(event) => {
                    event.preventDefault();
                }}
            >
                <span className="item-drag-handle__visual" />
            </div>
            <label className="item-checkbox-label">
                <input
                    aria-label={`Mark ${item.title || "item"} as checked`}
                    checked={Boolean(item.check_time)}
                    className="item-checkbox"
                    onChange={(event) => {
                        toggleChecked(event.target.checked);
                    }}
                    readOnly={readonlyText}
                    type="checkbox"
                />
            </label>
            <label className="item-textarea-label">
                {readonlyText ? (
                    <div className={"item-input"}>{item.title}</div>
                ) : (
                    <textarea
                        id={`input-${item.id}`}
                        className={classNames("item-input")}
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
                            onChange(event.currentTarget.value);
                        }}
                        onSelect={onTextSelectionChange}
                        onKeyDown={onKeyDown}
                        rows={1}
                        value={item.title}
                    />
                )}
            </label>
            {DEBUG_ENABLED && (
                <span
                    style={{
                        fontSize: "10px",
                        fontFamily: "monospace",
                        gap: "2px",
                        whiteSpace: "nowrap",
                    }}
                >
                    <span
                        style={{
                            color: "#FFCA98",
                        }}
                    >
                        pos=[{item.position}]
                    </span>
                    <span
                        style={{
                            color: "#989AFF",
                        }}
                    >
                        upd=[{item.update_index}]
                    </span>
                    <span
                        style={{
                            color: "#98FFAE",
                        }}
                    >
                        id=[{item.id}]
                    </span>
                    <span
                        style={{
                            color: "#C1FF98",
                        }}
                    >
                        updated=[{new Date(item.updated).getTime()}]
                    </span>
                    <span>{item.persisted ? "✅" : "⏳"}</span>
                </span>
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
