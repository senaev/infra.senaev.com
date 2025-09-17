import { useState } from 'react';

import { UnsignedInteger } from '../types/Number/UnsignedInteger';

export function useReload(): [UnsignedInteger, VoidFunction] {
    const [
        reloadIndex,
        setReloadIndex,
    ] = useState(0);

    return [
        reloadIndex,
        () => {
            setReloadIndex(reloadIndex + 1);
        },
    ];
}
