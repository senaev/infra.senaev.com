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
        <div className="ErrorToasts" aria-live="polite" aria-label="Error notifications">
            {errors.map((error, index) => (
                <div className="ErrorToasts__toast" key={`${error}-${index}`} role="alert">
                    <div className="ErrorToasts__message">{error}</div>
                    <button
                        aria-label={`Dismiss error ${index + 1}`}
                        className="ErrorToasts__close"
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
