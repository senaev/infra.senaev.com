import { useState } from 'react';

import { deepEqual } from '../utils/Object/deepEqual/deepEqual';

export function setDeepEqualState<T>(defaultValue: T): [T, (nextValue: T) => void] {
    const [
        value,
        setValue,
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ] = useState(defaultValue);

    return [
        value,
        (nextValue) => {
            if (!deepEqual(value, nextValue)) {
                setValue(nextValue);
            }
        },
    ];
}
