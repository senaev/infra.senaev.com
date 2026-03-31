import { useNavigate } from "react-router-dom";
import "./PageHeader.css";

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
                    navigate("/");
                }}
            >
                {homeButtonIcon}
            </button>
            {children}
        </header>
    );
}
