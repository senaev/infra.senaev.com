import {
    describe,
    expect,
    it,
} from 'vitest';

import { createArray } from '../../Array/createArray/createArray';

import { fnv1a } from './fnv1a';

describe('fnv1a', () => {
    it('should return the same hash for the same string', () => {
        const str = 'hello world';
        expect(fnv1a(str)).toBe(fnv1a(str));
    });

    it('should return different hashes for different strings', () => {
        expect(fnv1a('foo')).not.toBe(fnv1a('bar'));
    });

    it('should return a number for any string', () => {
        expect(typeof fnv1a('test')).toBe('bigint');
    });

    it('should handle empty string', () => {
        expect(fnv1a('')).toBe(0x811c9dc5n);
    });

    it('should handle unicode characters', () => {
        expect(fnv1a('😀')).toBe(fnv1a('😀'));
        expect(fnv1a('😀')).not.toBe(fnv1a('😁'));
    });

    it('should match known FNV-1a hash for "hello"', () => {
    // Precomputed FNV-1a 32-bit hash for "hello" with offset 0x811c9dc5
        expect(fnv1a('hello')).toBe(1335831723n);
    });

    it('should match known FNV-1a hash for "world"', () => {
        expect(fnv1a('world')).toBe(933488787n);
    });

    it('should make different results for similar strings', () => {
        const SMALL_NUMBER_EXPECTATIONS = [
            890022063,
            873244444,
            923577301,
            906799682,
            822911587,
            806133968,
            856466825,
            839689206,
            1024243015,
            1007465396,
        ];
        expect(createArray(10).map((_, i) => Number(fnv1a(String(i)))))
            .toEqual(SMALL_NUMBER_EXPECTATIONS);

        const BIG_NUMBER_EXPECTATIONS = [
            1058825284,
            1075602903,
            1092380522,
            1109158141,
            991714808,
            1008492427,
            1025270046,
            1042047665,
            924604332,
            941381951,
        ];
        expect(createArray(10).map((_, i) => Number(fnv1a(String(1_000_000_000 + i)))))
            .toEqual(BIG_NUMBER_EXPECTATIONS);

        const STRING_EXPECTATIONS = [
            527626686,
            544404305,
            494071448,
            510849067,
            594737162,
            611514781,
            561181924,
            577959543,
            393405734,
            410183353,
        ];
        expect(createArray(10).map((_, i) => Number(fnv1a(`hello! ${i}`))))
            .toEqual(STRING_EXPECTATIONS);
    });
});
