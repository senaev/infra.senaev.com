export const mapGetOrSet = <K, V>(map: Map<K, V>, key: K, value: V): V => {
    if (!map.has(key)) {
        map.set(key, value);
    }

    return map.get(key)!;
};
