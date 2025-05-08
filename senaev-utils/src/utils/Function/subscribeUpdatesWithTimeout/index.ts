import { Milliseconds } from '../../../types/Time/Milliseconds';
import { noop } from '../noop';

export function subscribeUpdatesWithTimeout<T> ({
    callback,
    subscribe,
    timeout,
    onResubscribe,
}: {
    callback: (value: T) => void;
    subscribe: (cb: typeof callback) => VoidFunction;
    timeout: Milliseconds;
    onResubscribe: VoidFunction;
}): void {
    let refreshTimeoutId: ReturnType<typeof setTimeout>;
    const clearResubscribeTimeout = () => {
        clearTimeout(refreshTimeoutId);
    };
    const setResubscribeTimeout = () => {
        refreshTimeoutId = setTimeout(resubscribe, timeout);
    };

    let unsubscribe = noop;
    const resubscribe = (isFirst = false) => {
        if (!isFirst) {
            onResubscribe();
        }

        clearResubscribeTimeout();
        unsubscribe();

        unsubscribe = subscribe((value) => {
            clearResubscribeTimeout();

            callback(value);

            setResubscribeTimeout();
        });

        setResubscribeTimeout();
    };

    resubscribe(true);
}
