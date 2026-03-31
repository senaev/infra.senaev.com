import "./MainPage.css";

import { useNavigate } from "react-router-dom";
import { UNTITLED_PLACEHOLDER } from "../../const/UNTITLED_PLACEHOLDER";
import { NotesList } from "../../NotesList/NotesList";
import { MainPageHeader } from "../MainPageHeader/MainPageHeader";

export function MainPage({ lists }: { lists: NotesList }) {
    const navigate = useNavigate();

    const createNewNote = async () => {
        const { id } = await lists.createNewOne();

        navigate(`/${id}`);
    };

    if (lists.items === undefined) {
        return <div className="preloader">🔄 Loading lists...</div>;
    }

    return (
        <div className="MainPage">
            <MainPageHeader createNewNote={createNewNote} />

            {lists.items.length === 0 ? (
                <div className="MainPage__emptyState">
                    <button
                        type="button"
                        className="MainPage__addFirstListButton"
                        aria-label="Add my first list"
                        onClick={createNewNote}
                    >
                        <span className="MainPage__addFirstListButton__icon">🆕</span>
                        <span className="MainPage__addFirstListButton__title">
                            Create first note
                        </span>
                    </button>
                </div>
            ) : (
                <div className="MainPage__items">
                    {lists.items.map((list) => (
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
                                        opacity: 0.7,
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
            )}
        </div>
    );
}
