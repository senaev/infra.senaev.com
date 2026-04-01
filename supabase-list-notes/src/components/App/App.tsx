import "./App.css";

import { SupabaseClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { useErrorsContext } from "../../contexts/ErrorsContext";
import { NotesListContext, useNotesListContext } from "../../contexts/NotesListContext";
import {
    SupabaseClientContextProvider,
    SupabaseClientStatusObjectNotReady,
    useSupabaseClientContext,
} from "../../contexts/SupabaseClientContext";
import { TablesContext, TablesContextType } from "../../contexts/TablesContext";
import { NotesList } from "../../NotesList/NotesList";
import { NoteItemsTable } from "../../tables/NoteItemsTable";
import { NotesListTable } from "../../tables/NotesListTable";
import { LoadingPageContent } from "../LoadingPageContent/LoadingPageContent";
import { MainPage } from "../MainPage/MainPage";
import { MainPageHeader } from "../MainPageHeader/MainPageHeader";
import { NoteHeader } from "../NoteHeader/NoteHeader";
import { NotePage } from "../NotePage/NotePage";
import { Page404 } from "../Page404/Page404";

export function NoteRouteElement() {
    const { noteId } = useParams<{ noteId: string }>();
    const { items } = useNotesListContext();

    const numberNoteId = Number(noteId);
    if (!Number.isInteger(numberNoteId) || numberNoteId <= 0) {
        return <Page404 />;
    }

    if (items === undefined) {
        return (
            <>
                <MainPageHeader />
                <LoadingPageContent />
            </>
        );
    }

    const listExists = items.some((list) => list.id === numberNoteId);
    if (!listExists) {
        return <Page404 />;
    }

    return (
        <>
            <NoteHeader
                noteId={numberNoteId}
                jumpToEdit={() => {
                    // TODO: implement
                }}
            />
            <NotePage noteId={numberNoteId} />
        </>
    );
}

export function NotesApp({ supabaseClient }: { supabaseClient: SupabaseClient }) {
    const { showError } = useErrorsContext();

    const tablesRef = useRef<TablesContextType | null>(null);
    if (!tablesRef.current) {
        tablesRef.current = {
            notesListTable: new NotesListTable(supabaseClient),
            noteItemsTable: new NoteItemsTable(supabaseClient),
        };
    }
    const tables = tablesRef.current;

    const [, setNotesListVer] = useState<number>(0);
    const notesListRef = useRef<NotesList | null>(null);
    if (!notesListRef.current) {
        notesListRef.current = new NotesList({
            notesListTable: tables.notesListTable,
            showError,
            onChange: () => {
                setNotesListVer((prev) => prev + 1);
            },
        });
    }
    const notesList = notesListRef.current;

    return (
        <TablesContext.Provider value={tables}>
            <NotesListContext.Provider value={notesList}>
                <Routes>
                    <Route path="/" element={<MainPage />} />
                    <Route path="/:noteId" element={<NoteRouteElement />} />
                    <Route path="*" element={<Page404 />} />
                </Routes>
            </NotesListContext.Provider>
        </TablesContext.Provider>
    );
}

const SUPABASE_DASHBOARD_LINK = "https://supabase.com/dashboard";

export function AuthPage({ statusObject }: { statusObject: SupabaseClientStatusObjectNotReady }) {
    return (
        <>
            <MainPageHeader />
            <section>
                <h3>1. Create database</h3>
                <p>
                    Log in to your Supabase account and create a new project on{" "}
                    <a href={SUPABASE_DASHBOARD_LINK} target="_blank" rel="noopener noreferrer">
                        dashboard
                    </a>
                    .
                </p>
                <p>Create tables using the SQL request.</p>
            </section>
        </>
    );
}

export function NotesWithAuthApp() {
    const supabaseClientContext = useSupabaseClientContext();

    if (supabaseClientContext.status === "ready") {
        return <NotesApp supabaseClient={supabaseClientContext.client} />;
    }

    return <AuthPage statusObject={supabaseClientContext} />;
}

export function App() {
    return (
        <div className="App__page">
            <main className="App__main">
                <SupabaseClientContextProvider>
                    <NotesWithAuthApp />
                </SupabaseClientContextProvider>
            </main>
        </div>
    );
}
