import "./App.css";

import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useErrorsContext } from "../../contexts/ErrorsContext";
import { ListsContext } from "../../contexts/ListsContext";
import { useLists } from "../../Lists/useLists";
import { ListPageElement } from "../ListPageElement/ListPageElement";
import { ListsPageElement } from "../ListsPageElement/ListsPageElement";

function ListRouteElement() {
    const { listId } = useParams<{ listId: string }>();

    return <ListPageElement listId={Number(listId)} />;
}

export function App() {
    const { showError } = useErrorsContext();

    const [, lists] = useLists({
        showError,
    });

    return (
        <ListsContext.Provider value={lists}>
            <div className="page">
                <main className="main-container">
                    <Routes>
                        <Route path="/" element={<ListsPageElement lists={lists} />} />
                        <Route path="/:listId" element={<ListRouteElement />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </ListsContext.Provider>
    );
}
