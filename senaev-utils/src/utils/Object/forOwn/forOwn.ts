import { hasOwnProperty } from '../hasOwnProperty/hasOwnProperty';

export function forOwn<Obj extends {}>(
    obj: Obj,
    fn: (value: Obj[keyof Obj], key: keyof Obj, sourceObj: Obj) => void
): void {
    for (const key in obj) {
        if (hasOwnProperty(obj, key)) {
            fn(obj[key], key, obj);
        }
    }
}
