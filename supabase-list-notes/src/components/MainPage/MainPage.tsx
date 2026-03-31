import "./MainPage.css";

import { useNavigate } from "react-router-dom";
import { UNTITLED_PLACEHOLDER } from "../../const/UNTITLED_PLACEHOLDER";
import { useNotesListContext } from "../../contexts/NotesListContext";
import { FullPageContent } from "../FullPageContent/FullPageContent";
import { MainPageHeader } from "../MainPageHeader/MainPageHeader";

function MainPageContent({ createNewNote }: { createNewNote: VoidFunction }) {
    const { items } = useNotesListContext();
    const navigate = useNavigate();

    if (items === undefined) {
        return (
            <FullPageContent>
                <span className="MainPage__fullPageContent__icon">🔄</span>
                <span className="MainPage__fullPageContent__title">Loading notes…</span>
            </FullPageContent>
        );
    }

    if (items.length === 0) {
        return (
            <FullPageContent>
                <button
                    type="button"
                    className="MainPage__addFirstListButton"
                    aria-label="Add my first list"
                    onClick={createNewNote}
                >
                    <span className="MainPage__fullPageContent__icon">🚀</span>
                    <span className="MainPage__fullPageContent__title">Create first note</span>
                </button>
            </FullPageContent>
        );
    }

    return (
        <div className="MainPage__items">
            {items.map((list) => (
                <button
                    key={list.id}
                    type="button"
                    className="MainPage__item"
                    onClick={() => {
                        navigate(`/${list.id}`);
                    }}
                >
                    {list.title.trim() ? (
                        <span className="MainPage__itemTitle">{list.title}</span>
                    ) : (
                        <span
                            className="MainPage__itemTitle"
                            style={{
                                opacity: 0.5,
                            }}
                        >
                            {UNTITLED_PLACEHOLDER}
                        </span>
                    )}
                    <span className="MainPage__itemMeta">
                        <span>{`${list.items_count - list.undone_items_count}/${list.items_count}`}</span>
                    </span>
                </button>
            ))}
        </div>
    );
}

export function MainPage() {
    const navigate = useNavigate();

    const lists = useNotesListContext();
    const createNewNote = async () => {
        const { id } = await lists.createNewOne();

        navigate(`/${id}`);
    };

    return (
        <div className="MainPage">
            <MainPageHeader createNewNote={createNewNote} />
            <MainPageContent createNewNote={createNewNote} />
        </div>
    );
}
