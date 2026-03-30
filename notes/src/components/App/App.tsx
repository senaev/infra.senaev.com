import "./App.css";

import { ListPageElement } from "../ListPageElement/ListPageElement";
import { ListsPageElement } from "../ListsPageElement/ListsPageElement";

const LIST_ID = 1;

export function App() {
    return (
        <div className="page">
            <main className="main-container">
                {false ? <ListsPageElement /> : <ListPageElement listId={LIST_ID} />}
            </main>
        </div>
    );
}
