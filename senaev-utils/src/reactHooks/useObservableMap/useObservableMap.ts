import { useEffect, useRef } from 'react';

import { UnsignedInteger } from '../../types/Number/UnsignedInteger';
import { ObservableMap } from '../../utils/Map/ObservableMap/ObservableMap';
import { useReload } from '../useReload';

export function useObservableMap<K, V>(initialValue?: Iterable<readonly [K, V]> | null): [ObservableMap<K, V>, UnsignedInteger] {
    const [
        reload,
        reloadIndex,
    ] = useReload();

    const mapRef = useRef<ObservableMap<K, V>>(new ObservableMap(initialValue));

    useEffect(() => mapRef.current.subscribe(reload), []);

    return [
        mapRef.current,
        reloadIndex,
    ];
}
