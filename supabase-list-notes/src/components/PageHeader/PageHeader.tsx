import { useNavigate } from "react-router-dom";
import "./PageHeader.css";
import { ROUTES } from "../../const/ROUTES";

export function PageHeader({
    children,
    homeButtonIcon,
}: {
    children: React.ReactNode;
    homeButtonIcon: React.ReactNode;
}) {
    const navigate = useNavigate();

    return (
        <header className="PageHeader">
            <button
                onClick={() => {
                    navigate(ROUTES.home);
                }}
            >
                {homeButtonIcon}
            </button>
            {children}
        </header>
    );
}
