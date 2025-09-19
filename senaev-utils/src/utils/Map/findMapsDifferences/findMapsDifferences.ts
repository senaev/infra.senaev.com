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

    // Add series that has been added to settings but not to chart yet
    originalMapKeys.difference(targetMapKeys).forEach((id) => {
        result.added.push(id);
    });

    // Replace series on chart if settings has been changed
    originalMapKeys.intersection(targetMapKeys).forEach((id) => {
        const originalValue = originalMap.get(id);
        const targetValue = targetMap.get(id);

        if (originalValue !== targetValue) {
            result.updated.push(id);
        }
    });

    // Remove all series that are not represented in settings anymore
    targetMapKeys.difference(originalMapKeys).forEach((id) => {
        result.deleted.push(id);
    });

    return result;
}
