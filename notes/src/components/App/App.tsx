import "./App.css";

import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useErrorsContext } from "../../contexts/ErrorsContext";
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

    console.log("lists", lists);

    return (
        <div className="page">
            <main className="main-container">
                <Routes>
                    <Route path="/" element={<ListsPageElement />} />
                    <Route path="/:listId" element={<ListRouteElement />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
}
