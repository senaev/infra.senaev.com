import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

export function useLocationParameter({
    parameterName,
    defaultValue,
}: {
    parameterName: string;
    defaultValue: string;
}): [value: string, setValue: (nextValue: string) => void] {
    const location = useLocation();
    const navigate = useNavigate();

    // Extract the query parameter from the URL
    const queryParams = new URLSearchParams(location.search);

    const initialValue = queryParams.get(parameterName) || defaultValue;

    // Set the query parameter as state
    const [
        stateValue,
        setStateValue,
    ] = useState(initialValue);

    // Update the query parameter in the URL when the state changes
    useEffect(() => {
        const params = new URLSearchParams(location.search);

        if (stateValue === defaultValue) {
            params.delete(parameterName);
        } else {
            params.set(parameterName, String(stateValue));
        }

        navigate(`?${params.toString()}`, { replace: true });
    }, [
        defaultValue,
        parameterName,
        stateValue,
        location.search,
        navigate,
    ]);

    return [
        stateValue,
        setStateValue,
    ];
}
