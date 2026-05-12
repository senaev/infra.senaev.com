import {
    describe,
    expect,
    test,
} from 'vitest';

import type { Bytes } from '../Bytes';

import { formatBytes } from './formatBytes';

describe('formatBytes', () => {
    const testCases: Array<{
        bytes: Bytes;
        expected: string;
    }> = [
        {
            bytes: 0 as Bytes,
            expected: '0 B',
        },
        {
            bytes: 1 as Bytes,
            expected: '1 B',
        },
        {
            bytes: 1023 as Bytes,
            expected: '1023 B',
        },
        {
            bytes: 1024 as Bytes,
            expected: '1.0 KB',
        },
        {
            bytes: 1536 as Bytes,
            expected: '1.5 KB',
        },
        {
            bytes: 1048576 as Bytes,
            expected: '1.0 MB',
        },
        {
            bytes: 1572864 as Bytes,
            expected: '1.5 MB',
        },
        {
            bytes: 1073741824 as Bytes,
            expected: '1.0 GB',
        },
        {
            bytes: 1099511627776 as Bytes,
            expected: '1.0 TB',
        },
        {
            bytes: 10485760 as Bytes,
            expected: '10 MB',
        },
        {
            bytes: 1125899906842624 as Bytes,
            expected: '1024 TB',
        },
    ];

    testCases.forEach(({ bytes, expected }) => {
        test(`formatBytes(${bytes}) -> ${expected}`, () => {
            expect(formatBytes(bytes)).toBe(expected);
        });
    });

    test('should keep one fractional digit for non-byte units below ten', () => {
        expect(formatBytes(1280 as Bytes)).toBe('1.3 KB');
    });

    test('should round to the nearest whole number for non-byte units from ten and above', () => {
        expect(formatBytes(10702848 as Bytes)).toBe('10 MB');
    });
});
