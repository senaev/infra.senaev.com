export type SubscribableValueCallback<T> = (this: unknown, value: T) => void;

export interface SubscribableValue<T> {
    getValue(): T | undefined;
    subscribe(callback: SubscribableValueCallback<T>): VoidFunction;
}
