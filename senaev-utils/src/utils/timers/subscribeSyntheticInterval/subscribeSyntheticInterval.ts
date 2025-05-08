import { Milliseconds } from '../../../types/Time/Milliseconds';
import { callFunctions } from '../../Function/callFunctions/callFunctions';
import { UnsignedInteger } from '../../Number/UnsignedInteger';

type IntervalSubscription = {
    intervalId: UnsignedInteger;
    subscribers: Set<VoidFunction>;
};

const subscribersMap: Map<Milliseconds, IntervalSubscription> = new Map();

const TIMEUPDATE_INTERVAL: Milliseconds = 1000;

/**
 * Функция нужна для того, чтобы не дублировать интервалы, предназначенные для обновления состояния видео-рекламы
 *
 * Функция принимает коллбек, который будет вызываться по интервалу, возвращает метод для отписки
 *
 * Интервал запускается при первом вызове и останавливается после того, как у него не остаётся подписчиков.
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
