import { useRef, useState } from "react";
import { List } from "./List";

export function useList(params: {
    listId: number;
    showError: (message: string) => void;
}): [number, List] {
    const [itemsVer, setItemsVer] = useState<number>(0);

    const listRef = useRef<List | null>(null);
    if (!listRef.current) {
        listRef.current = new List({
            ...params,
            onChange: () => setItemsVer((prev) => prev + 1),
        });
    }
    const list = listRef.current;

    return [itemsVer, list];
}
