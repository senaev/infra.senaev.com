import { createContext, useContext } from "react";
import { NotesList } from "../NotesList/NotesList";

type NotesListContextType = NotesList | undefined;

export const NotesListContext = createContext<NotesListContextType>(undefined);
NotesListContext.displayName = "NotesListContext";

export const useNotesListContext = (): NotesList => {
    const notesList = useContext(NotesListContext);
    if (!notesList) {
        throw new Error("useNotesListContext must be used inside NotesListContext.Provider");
    }

    return notesList;
};
