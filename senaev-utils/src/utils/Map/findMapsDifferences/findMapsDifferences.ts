export function findMapsDifferences<K, V, V2>(originalMap: Map<K, V>, targetMap: Map<K, V2>): {
    added: K[];
    updated: K[];
    deleted: K[];
} {
    const result = {
        added: [] as K[],
        updated: [] as K[],
        deleted: [] as K[],
    };

    // Value added to the original map
    targetMap.forEach((_, id) => {
        if (!originalMap.has(id)) {
            result.added.push(id);
        }
    });

    originalMap.forEach((_, id) => {
        if (targetMap.has(id)) {
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
