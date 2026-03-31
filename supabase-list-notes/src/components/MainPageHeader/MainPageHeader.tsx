import { PageHeader } from "../PageHeader/PageHeader";

export const APP_NAME = "Supabase ListNotes";

export function MainPageHeader({ createNewList }: { createNewList?: VoidFunction }) {
    return (
        <PageHeader
            homeButtonIcon={<img className="supabase-logo" src="/supabase-logo.svg" alt="Home" />}
        >
            <h1 className="lists-page__title">{APP_NAME}</h1>
            {createNewList ? (
                <button type="button" aria-label="Add list" onClick={createNewList}>
                    🆕
                </button>
            ) : null}
        </PageHeader>
    );
}
