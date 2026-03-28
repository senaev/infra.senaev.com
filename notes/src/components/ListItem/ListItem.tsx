import classNames from "classnames";
import { KeyboardEvent, SyntheticEvent } from "react";
import { DEBUG_ENABLED } from "../../const/DEBUG_ENABLED";
import { DragHandlers } from "../../types/DragHandlers";
import { TodoListItem } from "../../types/TodoListItem";

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
    readonly,
}: {
    item: TodoListItem;
    toggleChecked: (id: number, checked: boolean) => void;
    onChange: (id: number, value: string) => void;
    onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onRemove: VoidFunction;
    dragState?: "ghost" | "source";
    dragHandlers: DragHandlers;
    resizeTextarea: (input: HTMLTextAreaElement) => void;
    inputRefs: React.RefObject<Map<number, HTMLTextAreaElement>>;
    readonly?: boolean;
}) {
    return (
        <div
            className={classNames("item-row", {
                "item-row--drag-source": dragState === "source",
                "item-row--drag-overlay": dragState === "ghost",
            })}
        >
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
                    readOnly={readonly}
                    type="checkbox"
                />
            </label>
            <label className="item-textarea-label">
                {readonly ? (
                    <div
                        className={classNames("item-input", "item-input--drag-ghost", {
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
                            onChange(item.id, event.currentTarget.value);
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
