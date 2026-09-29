import { UnsignedInteger } from '../../../types/Number/UnsignedInteger';
import { Milliseconds } from '../../../types/Time/Milliseconds';
import { callFunctions } from '../../Function/callFunctions/callFunctions';

type IntervalSubscription = {
    intervalId: UnsignedInteger;
    subscribers: Set<VoidFunction>;
};

const subscribersMap: Map<Milliseconds, IntervalSubscription> = new Map();

const TIMEUPDATE_INTERVAL: Milliseconds = 1000;

/**
 * The function exists to avoid duplicate intervals that update the state of video ads
 *
 * The function takes a callback that is called on each interval tick, and returns a method to unsubscribe
 *
 * The interval starts on the first call and stops when it has no subscribers left.
 */
export function subscribeSyntheticInterval(intervalMs: Milliseconds, subscriber: () => void): () => void {
    if (!subscribersMap.has(intervalMs)) {
        subscribersMap.set(intervalMs, {
            intervalId: 0,
            subscribers: new Set(),
        });
    }

    const subscription: IntervalSubscription = subscribersMap.get(intervalMs)!;

    if (subscription.subscribers.size === 0) {
        subscription.intervalId = window.setInterval(() => {
            callFunctions(subscription.subscribers);
        }, TIMEUPDATE_INTERVAL);
    }

    subscription.subscribers.add(subscriber);

    return () => {
        subscription.subscribers.delete(subscriber);

        if (subscription.subscribers.size === 0) {
            window.clearInterval(subscription.intervalId);
            subscribersMap.delete(intervalMs);
        }
    };
}
