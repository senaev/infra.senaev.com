import {
    describe,
    expect,
    test,
} from 'vitest';

import { mapObjectValues } from './mapObjectValues';

describe('mapObjectValues', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testCases: Record<string, any>[][] = [
        [
            {},
            {},
        ],
        [
            { foo: 1 },
            { foo: 'foo-1' },
        ],
        [
            {
                foo: 1,
                bar: 2,
            },
            {
                foo: 'foo-1',
                bar: 'bar-2',
            },
        ],
    ];

    testCases.forEach(([
        obj,
        ret,
    ]) => {
        test(`${JSON.stringify(obj)} -> ${ret}`, () => {
            expect(mapObjectValues(obj, (value, key) => `${key}-${value}`)).to.eql(ret);
        });
    });

    test('should map A to B', () => {
        type A = {
            foo: 'bar';
        };

        type B = {
            foo: 'baz';
        };

        const expectB = (_b: B) => undefined;

        const a: A = { foo: 'bar' };
        const maybeB: B = mapObjectValues(a, (_value, key) => {
            if (key === 'foo') {
                return 'baz' as const;
            }

            return undefined;
        });

        expectB(maybeB);

        const b: B = {
            foo: 'baz',
        };

        expect(maybeB).to.eql(b);
    });

    test('should map with different types', () => {
        type A = {
            foo: (foo: 'foo') => number;
            bar?: (bar: 'bar') => string;
        };

        type B = {
            foo: (_foo: 'not foo') => number;
            bar?: string;
            baz: undefined;
        };

        const a: A = {
            foo: () => 123,
            bar: () => 'yeeet',
        };

        const b: B = {
            foo: (_foo) => 999,
            bar: 'bar',
            baz: undefined,
        };

        const expectB = (_b: B) => undefined;

        const maybeB: B = mapObjectValues(a, (_value, prop) => b[prop]);

        expectB(maybeB);
    });
});
