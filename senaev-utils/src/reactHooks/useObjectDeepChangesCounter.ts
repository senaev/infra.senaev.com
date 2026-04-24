import { useRef } from 'react';

import { PositiveInteger } from '../types/Number/PositiveInteger';
import { deepEqual } from '../utils/Object/deepEqual/deepEqual';

import { useReload } from './useReload';

export function useObjectDeepChangesCounter(object: unknown): PositiveInteger {
    const [
        reload,
        reloadIndex,
    ] = useReload();

    const objectRef = useRef(object);

    // eslint-disable-next-line react-hooks/refs
    if (!deepEqual(object, objectRef.current)) {
        // eslint-disable-next-line react-hooks/refs
        objectRef.current = object;
        reload();
    }

    return reloadIndex;
}
