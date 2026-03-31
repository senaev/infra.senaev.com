import "./App.css";

import { useRef, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { useErrorsContext } from "../../contexts/ErrorsContext";
import { NotesListContext, useNotesListContext } from "../../contexts/NotesListContext";
import { NotesList } from "../../NotesList/NotesList";
import { MainPage } from "../MainPage/MainPage";
import { NotePage } from "../NotePage/NotePage";
import { Page404 } from "../Page404/Page404";

function ListRouteElement() {
    const { listId } = useParams<{ listId: string }>();
    const lists = useNotesListContext();

    const numberListId = Number(listId);
    if (!Number.isInteger(numberListId) || numberListId <= 0) {
        console.log(1);
        return <Page404 />;
    }

    const listExists = lists.items?.some((list) => list.id === numberListId);
    if (!listExists) {
        console.log(2);
        return <Page404 />;
    }

    return <NotePage listId={numberListId} />;
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
            <div className="page">
                <main className="main-container">
                    <Routes>
                        <Route path="/" element={<MainPage lists={notesList} />} />
                        <Route path="/:listId" element={<ListRouteElement />} />
                        <Route path="*" element={<Page404 />} />
                    </Routes>
                </main>
            </div>
        </NotesListContext.Provider>
    );
}
