import { PropsWithChildren, createContext, useContext, useState } from "react";
import { ErrorToasts } from "../components/ErrorToasts/ErrorToasts";
import { noop } from "../utils/noop";

type ErrorsContextType = {
    showError: (error: string) => void;
    hideError: (errorIndex: number) => void;
    errors: string[];
};

const ErrorsContextDefaultValue: ErrorsContextType = {
    showError: noop,
    hideError: noop,
    errors: [],
};

export const ErrorsContext = createContext<ErrorsContextType>(ErrorsContextDefaultValue);
ErrorsContext.displayName = "ErrorsContext";

export function ErrorsProvider({ children }: PropsWithChildren) {
    const [errors, setErrors] = useState<string[]>([]);

    function hideError(errorIndex: number) {
        setErrors((current) =>
            current.filter((_, currentErrorIndex) => currentErrorIndex !== errorIndex),
        );
    }

    return (
        <ErrorsContext.Provider
            value={{
                showError: (error) => {
                    console.error(error);
                    setErrors((current) => [...current, error]);
                },
                hideError,
                errors,
            }}
        >
            {children}
            {/* TODO: move from Context to App */}
            <ErrorToasts errors={errors} onClose={hideError} />
        </ErrorsContext.Provider>
    );
}

export const useErrorsContext = () => {
    return useContext(ErrorsContext);
};
