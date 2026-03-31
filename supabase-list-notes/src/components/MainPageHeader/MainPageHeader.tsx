import "./MainPageHeader.css";

import { APP_TITLE } from "../../const/APP_TITLE";
import { PageHeader } from "../PageHeader/PageHeader";

export function MainPageHeader({ createNewNote }: { createNewNote?: VoidFunction }) {
    return (
        <PageHeader
            homeButtonIcon={
                <img className="MainPageHeader__supabaseLogo" src="/supabase-logo.svg" alt="Home" />
            }
        >
            <h1 className="MainPageHeader__appTitle">{APP_TITLE}</h1>
            {createNewNote ? (
                <button type="button" aria-label="Add note" onClick={createNewNote}>
                    🆕
                </button>
            ) : null}
        </PageHeader>
    );
}
