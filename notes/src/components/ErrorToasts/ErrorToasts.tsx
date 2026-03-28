import "./ErrorToasts.css";

type ErrorToastsProps = {
    errors: string[];
    onClose: (index: number) => void;
};

export function ErrorToasts({ errors, onClose }: ErrorToastsProps) {
    if (errors.length === 0) {
        return null;
    }

    return (
        <div className="error-toasts" aria-live="polite" aria-label="Error notifications">
            {errors.map((error, index) => (
                <div className="error-toast" key={`${error}-${index}`} role="alert">
                    <div className="error-toast__message">{error}</div>
                    <button
                        aria-label={`Dismiss error ${index + 1}`}
                        className="error-toast__close"
                        onClick={() => {
                            onClose(index);
                        }}
                        type="button"
                    >
                        Close
                    </button>
                </div>
            ))}
        </div>
    );
}
