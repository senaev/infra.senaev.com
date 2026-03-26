import { useRef, useState } from "react";
import { TodoList } from "./TodoList";

export function useTodoList(todoListId: number): [number, TodoList] {
    const [itemsVer, setItemsVer] = useState<number>(0);

    const todoListRef = useRef<TodoList | null>(null);
    if (!todoListRef.current) {
        todoListRef.current = new TodoList(todoListId, () => setItemsVer((prev) => prev + 1));
    }
    const todoList = todoListRef.current;

    return [itemsVer, todoList];
}
