import { mapObjectValues } from '../mapObjectValues/mapObjectValues';

import { ObjectKeysMirror } from './ObjectKeysMirror';

export function mirrorObject<T extends Record<string, unknown>>(object: T): ObjectKeysMirror<T> {
    return mapObjectValues(object, (_value, key) => key) as ObjectKeysMirror<T>;
}
