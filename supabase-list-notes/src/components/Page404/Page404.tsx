import "./Page404.css";

import { MainPageHeader } from "../MainPageHeader/MainPageHeader";

export function Page404() {
    return (
        <div>
            <MainPageHeader />

            <div className="Page404__content">
                <span className="Page404__content_emoji">🤷</span>
                <h1>404: Not found</h1>
            </div>
        </div>
    );
}
