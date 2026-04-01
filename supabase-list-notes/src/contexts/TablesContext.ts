import React, { useContext } from "react";
import { NoteItemsTable } from "../tables/NoteItemsTable";
import { NotesListTable } from "../tables/NotesListTable";

export type TablesContextType = {
    notesListTable: NotesListTable;
    noteItemsTable: NoteItemsTable;
};

export const TablesContext = React.createContext<TablesContextType | null>(null);
TablesContext.displayName = "TablesContext";

export const useTablesContext = (): TablesContextType => {
    const context = useContext(TablesContext);
    if (!context) {
        throw new Error("useTablesContext must be used within a TablesProvider");
    }
    return context;
};
