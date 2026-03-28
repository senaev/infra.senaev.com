export function shiftItemsToInsertOnPosition<T extends { id: number; position: number }>(
    itemsSorted: T[],
    position: number,
    count: number,
): Map<number, number> {
    let itemIndex = 0;

    const shiftedItemsQueue: number[] = [];
    for (let i = 0; i < count; i++) {
        if (itemsSorted[itemIndex]?.position === position + i) {
            shiftedItemsQueue.push(itemsSorted[itemIndex].id);
            itemIndex++;
        }
    }

    const shiftedItems: Map<number, number> = new Map();
    let potentialPosition = position + count;
    while (shiftedItemsQueue.length > 0) {
        if (itemsSorted[itemIndex]?.position === potentialPosition) {
            shiftedItemsQueue.push(itemsSorted[itemIndex].id);
            itemIndex++;
        }

        const itemId = shiftedItemsQueue.shift()!;
        shiftedItems.set(itemId, potentialPosition);
        potentialPosition++;
    }

    return shiftedItems;
}
