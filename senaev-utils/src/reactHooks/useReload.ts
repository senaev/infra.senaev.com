import { useState } from 'react';

import { UnsignedInteger } from '../types/Number/UnsignedInteger';

export function useReload(): [VoidFunction, UnsignedInteger] {
    const [
        reloadIndex,
        setReloadIndex,
    ] = useState(0);

    return [
        () => {
            setReloadIndex((prevIndex) => prevIndex + 1);
        },
        reloadIndex,
    ];
}
