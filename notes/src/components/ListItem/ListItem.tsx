import classNames from "classnames";
import { KeyboardEvent, PointerEvent, SyntheticEvent } from "react";
import { DEBUG_ENABLED } from "../../const/DEBUG_ENABLED";
import { TodoListItem } from "../../types/TodoListItem";

type DragState = "overlay" | "source" | "source-collapsed" | "placeholder";

const DRAG_STATE_CLASSES: Record<DragState, string[]> = {
    overlay: ["item-row--drag-overlay"],
    source: ["item-row--drag-source"],
    "source-collapsed": ["item-row--drag-source", "item-row--drag-collapsed"],
    placeholder: ["item-row--drag-source"],
};

export function ListItem({
    item,
    toggleChecked,
    onChange,
    onSelect,
    onKeyDown,
    onRemove,
    dragState,
    onDragStart,
    resizeTextarea,
    inputRefs,
    readonly,
}: {
    item: TodoListItem;
    toggleChecked: (checked: boolean) => void;
    onChange: (value: string) => void;
    onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onRemove: VoidFunction;
    dragState: DragState | undefined;
    onDragStart: (event: PointerEvent<HTMLDivElement>) => void;
    resizeTextarea: (input: HTMLTextAreaElement) => void;
    inputRefs: React.RefObject<Map<number, HTMLTextAreaElement>>;
    readonly: boolean;
}) {
    return (
        <div
            className={classNames("item-row", DRAG_STATE_CLASSES[dragState as DragState], {
                "item-row--child": item.parent_id !== null,
            })}
        >
            <div
                aria-label={`Reorder item`}
                className="item-drag-handle"
                onPointerDown={(event) => {
                    onDragStart(event);
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
                        toggleChecked(event.target.checked);
                    }}
                    readOnly={readonly}
                    type="checkbox"
                />
            </label>
            <label className="item-textarea-label">
                {readonly ? (
                    <div
                        className={classNames("item-input", {
                            "is-checked": item.checked,
                        })}
                    >
                        {item.title || " "}
                    </div>
                ) : (
                    <textarea
                        id={`input-${item.id}`}
                        className={classNames("item-input", {
                            "is-checked": item.checked,
                        })}
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
                        onSelect={onSelect}
                        onKeyDown={onKeyDown}
                        rows={1}
                        value={item.title}
                    />
                )}
            </label>
            {DEBUG_ENABLED && (
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
