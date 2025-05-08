import {
    describe,
    expect,
    it,
} from 'vitest';

import { cloneObject } from './cloneObject';

describe('cloneObject', () => {
    it('should create a deep copy of a simple object', () => {
        const original = {
            name: 'test',
            value: 123,
        };
        const clone = cloneObject(original);

        expect(clone).toEqual(original);
        expect(clone).not.toBe(original);
    });

    it('should handle nested objects', () => {
        const original = {
            user: {
                name: 'John',
                settings: {
                    theme: 'dark',
                },
            },
        };
        const clone = cloneObject(original);

        expect(clone).toEqual(original);
        expect(clone.user).not.toBe(original.user);
        expect(clone.user.settings).not.toBe(original.user.settings);
    });

    it('should clone arrays', () => {
        const original = [
            1,
            2,
            [
                3,
                4,
            ],
        ];
        const clone = cloneObject(original);

        expect(clone).toEqual(original);
        expect(clone).not.toBe(original);
        expect(clone[2]).not.toBe(original[2]);
    });

    it('should handle complex types like Date', () => {
        const original = { date: new Date() };
        const clone = cloneObject(original);

        expect(clone).toEqual(original);
        expect(clone.date).not.toBe(original.date);
        expect(clone.date instanceof Date).toBe(true);
    });
});
