import "./ListsPageElement.css";

import { useNavigate } from "react-router-dom";
import { Lists } from "../../Lists/Lists";

export function ListsPageElement({ lists }: { lists: Lists }) {
    const navigate = useNavigate();

    const createNewList = async () => {
        const { id } = await lists.createNewOne();

        navigate(`/${id}`);
    };

    if (lists.items === undefined) {
        return <div className="preloader">🔄 Loading lists...</div>;
    }

    if (lists.items.length === 0) {
        return (
            <div className="lists-page-empty-state">
                <button
                    type="button"
                    className="lists-page-add-first-list-button"
                    aria-label="Add my first list"
                    onClick={createNewList}
                >
                    <span className="lists-page-add-first-list-button__icon">+</span>
                    <span className="lists-page-add-first-list-button__title">
                        Add my first list
                    </span>
                </button>
            </div>
        );
    }

    return (
        <div className="lists-page">
            <div className="lists-page__header">
                <h1 className="lists-page__title">Lists</h1>
                <button
                    type="button"
                    className="lists-page__add-button"
                    aria-label="Add list"
                    onClick={createNewList}
                >
                    + New list
                </button>
            </div>

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
                        <span className="lists-page__item-title">{list.title}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
