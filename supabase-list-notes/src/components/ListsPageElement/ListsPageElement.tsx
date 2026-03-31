import "./ListsPageElement.css";

import { useNavigate } from "react-router-dom";
import { Lists } from "../../Lists/Lists";
import { PageHeader } from "../PageHeader/PageHeader";

const APP_NAME = "Supabase ListNotes";

export const UNTITLED_PLACEHOLDER = "🤷 Untitled";

export function ListsPageElement({ lists }: { lists: Lists }) {
    const navigate = useNavigate();

    const createNewList = async () => {
        const { id } = await lists.createNewOne();

        navigate(`/${id}`);
    };

    if (lists.items === undefined) {
        return <div className="preloader">🔄 Loading lists...</div>;
    }

    return (
        <div className="lists-page">
            <PageHeader
                homeButtonIcon={
                    <img className="supabase-logo" src="/supabase-logo.svg" alt="Home" />
                }
            >
                <h1 className="lists-page__title">{APP_NAME}</h1>
                <button type="button" aria-label="Add list" onClick={createNewList}>
                    🆕
                </button>
            </PageHeader>

            {lists.items.length === 0 ? (
                <div className="lists-page-empty-state">
                    <button
                        type="button"
                        className="lists-page-add-first-list-button"
                        aria-label="Add my first list"
                        onClick={createNewList}
                    >
                        <span className="lists-page-add-first-list-button__icon">🆕</span>
                        <span className="lists-page-add-first-list-button__title">
                            Add my first list
                        </span>
                    </button>
                </div>
            ) : (
                <div className="lists-page__items">
                    {lists.items.map((list) => (
                        <button
                            key={list.id}
                            type="button"
                            className="lists-page__item"
                            onClick={() => {
                                navigate(`/${list.id}`);
                            }}
                        >
                            {list.title.trim() ? (
                                <span className="lists-page__item-title">{list.title}</span>
                            ) : (
                                <span
                                    className="lists-page__item-title"
                                    style={{
                                        opacity: 0.7,
                                    }}
                                >
                                    {UNTITLED_PLACEHOLDER}
                                </span>
                            )}
                            <span className="lists-page__item-meta">
                                <span>{`${list.items_count - list.undone_items_count}/${list.items_count}`}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
