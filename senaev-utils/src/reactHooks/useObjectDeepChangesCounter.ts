import { useRef } from 'react';

import { PositiveInteger } from '../types/Number/PositiveInteger';
import { deepEqual } from '../utils/Object/deepEqual/deepEqual';

import { useReload } from './useReload';

export function useObjectDeepChangesCounter(object: unknown): PositiveInteger {
    const [
        reloadIndex,
        reload,
    ] = useReload();

    const objectRef = useRef(object);

    if (!deepEqual(object, objectRef.current)) {
        objectRef.current = object;
        reload();
    }

    return reloadIndex;
}
