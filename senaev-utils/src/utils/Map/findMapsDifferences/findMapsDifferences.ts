import { MapAsState } from '../../../reactHooks/useMapAsState/useMapAsState';

export function findMapsDifferences<K, V, V2>(originalMap: MapAsState<K, V>, targetMap: MapAsState<K, V2>): {
    added: K[];
    updated: K[];
    deleted: K[];
} {
    const result = {
        added: [] as K[],
        updated: [] as K[],
        deleted: [] as K[],
    };

    const originalMapKeys = new Set(originalMap.keys());
    const targetMapKeys = new Set(targetMap.keys());

    // Value added to the original map
    targetMapKeys.difference(originalMapKeys).forEach((id) => {
        result.added.push(id);
    });

    originalMapKeys.forEach((id) => {
        if (targetMapKeys.has(id)) {
            const originalValue = originalMap.get(id);
            const targetValue = targetMap.get(id);

            // Value has been changed
            if (originalValue !== targetValue) {
                result.updated.push(id);
            }
        } else {
            // Value is not represented in settings anymore
            result.deleted.push(id);
        }
    });

    return result;
}
