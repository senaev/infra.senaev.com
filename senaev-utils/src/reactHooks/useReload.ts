import { useState } from 'react';

import { UnsignedInteger } from '../types/Number/UnsignedInteger';

export function useReload(): [VoidFunction, UnsignedInteger] {
    const [
        reloadIndex,
        setReloadIndex,
    ] = useState(0);

    return [
        () => {
            setReloadIndex(reloadIndex + 1);
        },
        reloadIndex,
    ];
}
