import { createContext, useContext } from "react";
import { NotesList } from "../NotesList/NotesList";

type NotesListContextType = NotesList | undefined;

export const NotesListContext = createContext<NotesListContextType>(undefined);
NotesListContext.displayName = "NotesListContext";

export const useNotesListContext = () => {
    const lists = useContext(NotesListContext);
    if (!lists) {
        throw new Error("useNotesListContext must be used inside NotesListContext.Provider");
    }

    return lists;
};
