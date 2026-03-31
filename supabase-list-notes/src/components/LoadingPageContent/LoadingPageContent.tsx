import "./LoadingPageContent.css";

import { ArrowPathRoundedSquareIcon } from "@heroicons/react/24/outline";
import { FullPageContent } from "../FullPageContent/FullPageContent";

export function LoadingPageContent() {
    return (
        <FullPageContent>
            <ArrowPathRoundedSquareIcon className="LoadingPageContent__loadingIcon" />
            <span className="LoadingPageContent__title">Loading…</span>
        </FullPageContent>
    );
}
