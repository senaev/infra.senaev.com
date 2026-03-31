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

    it("custom test 3", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 2, position: 2 },
                { id: 4, position: 4 },
                { id: 6, position: 6 },
                { id: 8, position: 8 },
            ],
            2,
            4,
        );

        expect(toObject(shiftedItems)).toEqual({
            2: 6,
            4: 7,
            6: 8,
            8: 9,
        });
    });

    it("custom test 4", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 0, position: 0 },
                { id: 1, position: 1 },
                { id: 2, position: 2 },
                { id: 4, position: 4 },
                { id: 6, position: 6 },
                { id: 8, position: 8 },
            ],
            2,
            4,
        );

        expect(toObject(shiftedItems)).toEqual({
            2: 6,
            4: 7,
            6: 8,
            8: 9,
        });
    });

    it("custom test 5", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 0, position: 0 },
                { id: 1, position: 1 },
                { id: 2, position: 2 },
                { id: 4, position: 4 },
                { id: 6, position: 6 },
                { id: 8, position: 8 },
            ],
            9,
            100,
        );

        expect(toObject(shiftedItems)).toEqual({});
    });

    it("custom test 6", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 0, position: 0 },
                { id: 1, position: 1 },
                { id: 2, position: 2 },
                { id: 4, position: 4 },
                { id: 6, position: 6 },
                { id: 8, position: 8 },
            ],
            7,
            100,
        );

        expect(toObject(shiftedItems)).toEqual({
            8: 107,
        });
    });

    it("initially duplicated positions", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 0, position: 0 },
                { id: 1, position: 1 },
                { id: 2, position: 1 },
                { id: 3, position: 2 },
                { id: 4, position: 3 },
                { id: 5, position: 8 },
            ],
            0,
            3,
        );

        expect(toObject(shiftedItems)).toEqual({
            0: 3,
            1: 4,
            2: 5,
            3: 6,
            4: 7,
        });
    });

    it("initially duplicated positions 1", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 0, position: 0 },
                { id: 1, position: 1 },
                { id: 2, position: 1 },
                { id: 3, position: 2 },
                { id: 4, position: 2 },
                { id: 5, position: 8 },
            ],
            2,
            2,
        );

        expect(toObject(shiftedItems)).toEqual({
            3: 4,
            4: 5,
        });
    });

    it("unsorted and duplicated positions", () => {
        const shiftedItems = shiftItemsToInsertOnPosition(
            [
                { id: 3, position: 2 },
                { id: 4, position: 2 },
                { id: 1, position: 1 },
                { id: 5, position: 8 },
                { id: 2, position: 1 },
                { id: 0, position: 0 },
            ],
            2,
            2,
        );

        expect(toObject(shiftedItems)).toEqual({
            3: 4,
            4: 5,
        });
    });
});
