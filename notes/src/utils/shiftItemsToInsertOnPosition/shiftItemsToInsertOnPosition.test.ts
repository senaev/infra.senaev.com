import { shiftItemsToInsertOnPosition } from "./shiftItemsToInsertOnPosition";

function toObject(map: Map<number, number>) {
    return Object.fromEntries(map.entries());
}

describe("shiftItemsToInsertOnPosition", () => {
    it("returns an empty map when nothing overlaps the inserted range", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 1, position: 4 },
                { id: 2, position: 6 },
            ],
            1,
            2,
        );

        expect(toObject(shiftedItems)).toEqual({});
    });

    it("shifts a contiguous block by one position", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 1, position: 2 },
                { id: 2, position: 3 },
                { id: 3, position: 4 },
            ],
            2,
            1,
        );

        expect(toObject(shiftedItems)).toEqual({
            1: 3,
            2: 4,
            3: 5,
        });
    });

    it("shifts items that overlap a multi-slot insertion window", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 1, position: 3 },
                { id: 2, position: 4 },
                { id: 3, position: 5 },
            ],
            2,
            2,
        );

        expect(toObject(shiftedItems)).toEqual({
            1: 4,
            2: 5,
            3: 6,
        });
    });

    it("stops shifting at the first gap after the affected block", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 1, position: 2 },
                { id: 2, position: 4 },
                { id: 3, position: 5 },
            ],
            2,
            1,
        );

        expect(toObject(shiftedItems)).toEqual({
            1: 3,
        });
    });

    it("custom test", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 2, position: 2 },
                { id: 4, position: 4 },
                { id: 6, position: 6 },
            ],
            2,
            4,
        );

        expect(toObject(shiftedItems)).toEqual({
            2: 6,
            4: 7,
            6: 8,
        });
    });

    it("custom test 2", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 2, position: 2 },
                { id: 4, position: 4 },
                { id: 6, position: 6 },
                { id: 7, position: 7 },
            ],
            2,
            4,
        );

        expect(toObject(shiftedItems)).toEqual({
            2: 6,
            4: 7,
            6: 8,
            7: 9,
        });
    });
});
