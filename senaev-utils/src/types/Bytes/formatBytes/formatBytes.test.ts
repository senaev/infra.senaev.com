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
            expected: '1 KB',
        },
        {
            bytes: 1536 as Bytes,
            expected: '2 KB',
        },
        {
            bytes: 1048576 as Bytes,
            expected: '1 MB',
        },
        {
            bytes: 1572864 as Bytes,
            expected: '2 MB',
        },
        {
            bytes: 1073741824 as Bytes,
            expected: '1 GB',
        },
        {
            bytes: 1099511627776 as Bytes,
            expected: '1 TB',
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

    test('should round to the nearest whole number for non-byte units', () => {
        expect(formatBytes(1280 as Bytes)).toBe('1 KB');
    });
});
