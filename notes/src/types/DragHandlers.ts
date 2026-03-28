import { PointerEvent } from "react";
import { TodoListItem } from "./TodoListItem";

export type DragHandlers = {
    start: (event: PointerEvent<HTMLDivElement>, item: TodoListItem) => void;
    move: (event: PointerEvent<HTMLDivElement>, item: TodoListItem) => void;
    stop: (event: PointerEvent<HTMLDivElement>, item: TodoListItem) => void;
};
