export function shiftItemsToInsertOnPosition<T extends { id: number; position: number }>(
    items: T[],
    position: number,
    count: number,
): Map<number, number> {
    const itemsSorted = [...items].sort((a, b) => a.position - b.position);

    let itemIndex = 0;
    while (itemsSorted[itemIndex]?.position < position) {
        itemIndex++;
    }

    const shiftedItemsQueue: number[] = [];
    for (let i = 0; i < count; i++) {
        while (itemsSorted[itemIndex]?.position === position + i) {
            shiftedItemsQueue.push(itemsSorted[itemIndex].id);
            itemIndex++;
        }
    }

    const shiftedItems: Map<number, number> = new Map();
    let potentialPosition = position + count;
    while (shiftedItemsQueue.length > 0) {
        while (itemsSorted[itemIndex]?.position === potentialPosition) {
            shiftedItemsQueue.push(itemsSorted[itemIndex].id);
            itemIndex++;
        }

        const itemId = shiftedItemsQueue.shift()!;
        shiftedItems.set(itemId, potentialPosition);
        potentialPosition++;
    }

    return shiftedItems;
}
