import {
    useEffect,
    useRef,
    useState,
} from 'react';

import { Milliseconds } from '../types/Time/Milliseconds';
import { AbortableProcess } from '../utils/AbortableProcess';
import { promiseTimeout } from '../utils/timers/promiseTimeout/promiseTimeout';

export function useRecentChangeTimer<T>(value: T, timeoutMs: Milliseconds): boolean {
    const [
        isRecentlyChanged,
        setIsRecentlyChanged,
    ] = useState(true);

    const lastValueRef = useRef<T>(value);

    useEffect(() => {
        const abortable = new AbortableProcess('useRecentChangeTimer');

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsRecentlyChanged(true);
        promiseTimeout(timeoutMs, { abortable }).then(() => {
            setIsRecentlyChanged(false);
        });

        return () => {
            abortable.abort('useEffect aborted');
        };
    }, [
        value,
        timeoutMs,
    ]);

    // eslint-disable-next-line react-hooks/refs
    const isValueChanged = lastValueRef.current !== value;

    if (isValueChanged) {
        // eslint-disable-next-line react-hooks/refs
        lastValueRef.current = value;
    }

    return isRecentlyChanged || isValueChanged;
}
