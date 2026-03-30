import { useRef, useState } from "react";
import { Lists } from "./Lists";

export function useLists(params: { showError: (message: string) => void }): [number, Lists] {
    const [itemsVer, setItemsVer] = useState<number>(0);

    const listRef = useRef<Lists | null>(null);
    if (!listRef.current) {
        listRef.current = new Lists({
            ...params,
            onChange: () => setItemsVer((prev) => prev + 1),
        });
    }
    const list = listRef.current;

    return [itemsVer, list];
}
