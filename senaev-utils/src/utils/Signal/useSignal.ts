import { useSyncExternalStore } from 'react';

import { Signal } from './Signal';

export function useSignal<T>(signal: Signal<T>): T {
    return useSyncExternalStore(
        (cb) => signal.subscribe(cb),
        () => signal.value()
    );
}
