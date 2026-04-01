import { useRef, useState } from "react";
import { useTablesContext } from "../contexts/TablesContext";
import { Note } from "./Note";

export function useNote(params: {
    listId: number;
    showError: (message: string) => void;
}): [number, Note] {
    const [noteVer, setNoteVer] = useState<number>(0);

    const { noteItemsTable } = useTablesContext();

    const noteRef = useRef<Note | null>(null);
    if (!noteRef.current) {
        noteRef.current = new Note({
            ...params,
            noteItemsTable,
            onChange: () => {
                setNoteVer((prev) => prev + 1);
            },
        });
    }
    const note = noteRef.current;

    return [noteVer, note];
}
