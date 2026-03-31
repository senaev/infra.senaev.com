import "./App.css";

import { useRef, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { useErrorsContext } from "../../contexts/ErrorsContext";
import { NotesListContext, useNotesListContext } from "../../contexts/NotesListContext";
import { NotesList } from "../../NotesList/NotesList";
import { MainPage } from "../MainPage/MainPage";
import { NoteHeader } from "../NoteHeader/NoteHeader";
import { NotePage } from "../NotePage/NotePage";
import { Page404 } from "../Page404/Page404";

function ListRouteElement() {
    const { noteId } = useParams<{ noteId: string }>();
    const lists = useNotesListContext();

    const numberNoteId = Number(noteId);
    if (!Number.isInteger(numberNoteId) || numberNoteId <= 0) {
        return <Page404 />;
    }

    const listExists = lists.items?.some((list) => list.id === numberNoteId);
    if (!listExists) {
        console.log(2);
        return <Page404 />;
    }

    return (
        <>
            <NoteHeader noteId={numberNoteId} />
            <NotePage noteId={numberNoteId} />
        </>
    );
}

export function App() {
    const { showError } = useErrorsContext();
    const [, setNotesListVer] = useState<number>(0);

    const notesListRef = useRef<NotesList | null>(null);
    if (!notesListRef.current) {
        notesListRef.current = new NotesList({
            showError,
            onChange: () => {
                setNotesListVer((prev) => prev + 1);
            },
        });
    }
    const notesList = notesListRef.current;

    return (
        <NotesListContext.Provider value={notesList}>
            <div className="App__page">
                <main className="App__main">
                    <Routes>
                        <Route path="/" element={<MainPage />} />
                        <Route path="/:noteId" element={<ListRouteElement />} />
                        <Route path="*" element={<Page404 />} />
                    </Routes>
                </main>
            </div>
        </NotesListContext.Provider>
    );
}
