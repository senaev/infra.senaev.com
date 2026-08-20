import { callFunctions } from '../../Function/callFunctions/callFunctions';

type ObservableMapEvent<K, V> =
| {
    type: 'set';
    key: K;
    value: V;
}
| {
    type: 'delete';
    key: K;
};

type ObservableMapCallback<K, V> = (event: ObservableMapEvent<K, V>) => void;

export class ObservableMap<K, V> extends Map<K, V> {
    private readonly _callbacks: Set<ObservableMapCallback<K, V>> = new Set();

    public subscribe(callback: ObservableMapCallback<K, V>): VoidFunction {
        this._callbacks.add(callback);

        return () => {
            this._callbacks.delete(callback);
        };
    }

    public set (key: K, value: V): this {
        const previousValue = this.get(key);

        super.set(key, value);

        if (value !== previousValue) {
            callFunctions(this._callbacks ?? [], {
                type: 'set',
                key,
                value,
            });
        }

        return this;
    }

    public delete (key: K): boolean {
        const result = super.delete(key);

        if (result) {
            callFunctions(this._callbacks ?? [], {
                type: 'delete',
                key,
            });
        }

        return result;
    }
}
