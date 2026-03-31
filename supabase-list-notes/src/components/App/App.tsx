import "./App.css";

import { Route, Routes, useParams } from "react-router-dom";
import { useErrorsContext } from "../../contexts/ErrorsContext";
import { ListsContext } from "../../contexts/ListsContext";
import { useLists } from "../../Lists/useLists";
import { MainPage } from "../MainPage/MainPage";
import { ListPageElement } from "../NotePage/NotePage";

function ListRouteElement() {
    const { listId } = useParams<{ listId: string }>();

    return <ListPageElement listId={Number(listId)} />;
}

export function Page404() {
    return (
        <div className="page-404">
            <h1 className="page-404__title">404: Page not found</h1>
        </div>
    );
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
                        <Route path="/" element={<MainPage lists={lists} />} />
                        <Route path="/:listId" element={<ListRouteElement />} />
                        <Route path="*" element={<Page404 />} />
                    </Routes>
                </main>
            </div>
        </ListsContext.Provider>
    );
}
