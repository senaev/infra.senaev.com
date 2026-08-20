import {
    describe, expect, test,
} from 'vitest';

import { excludeRanges } from './excludeRanges';

type Range = [number, number];

describe('excludeRanges', () => {
    const testCases: {
        input: [
            initialRange: Range,
            sortedRangesToExclude: Range[]
        ];
        expectedOutput: Range[];
    }[] = [
        {
            input: [
                [
                    9,
                    17,
                ],
                [
                    [
                        10,
                        11,
                    ],
                    [
                        12,
                        13,
                    ],
                    [
                        15,
                        16,
                    ],
                ],
            ],
            expectedOutput: [
                [
                    9,
                    10,
                ],
                [
                    11,
                    12,
                ],
                [
                    13,
                    15,
                ],
                [
                    16,
                    17,
                ],
            ],
        },
        {
            input: [
                [
                    9,
                    17,
                ],
                [
                    [
                        10,
                        11,
                    ],
                ],
            ],
            expectedOutput: [
                [
                    9,
                    10,
                ],
                [
                    11,
                    17,
                ],
            ],
        },
        {
            input: [
                [
                    -20,
                    20,
                ],
                [
                    [
                        -40,
                        -10,
                    ],
                ],
            ],
            expectedOutput: [
                [
                    -10,
                    20,
                ],
            ],
        },
        {
            input: [
                [
                    -20,
                    20,
                ],
                [
                    [
                        -40,
                        -10,
                    ],
                    [
                        10,
                        10000000,
                    ],
                ],
            ],
            expectedOutput: [
                [
                    -10,
                    10,
                ],
            ],
        },
        {
            input: [
                [
                    -20,
                    20,
                ],
                [
                    [
                        -40,
                        -10,
                    ],
                    [
                        -1,
                        1,
                    ],
                    [
                        10,
                        10000000,
                    ],
                ],
            ],
            expectedOutput: [
                [
                    -10,
                    -1,
                ],
                [
                    1,
                    10,
                ],
            ],
        },
        {
            input: [
                [
                    -20,
                    20,
                ],
                [
                    [
                        -400,
                        -100,
                    ],
                    [
                        -40,
                        -10,
                    ],
                    [
                        -1,
                        1,
                    ],
                    [
                        10,
                        10000000,
                    ],
                    [
                        10000001,
                        10000003,
                    ],
                ],
            ],
            expectedOutput: [
                [
                    -10,
                    -1,
                ],
                [
                    1,
                    10,
                ],
            ],
        },
        {
            input: [
                [
                    -0.5,
                    0.5,
                ],
                [
                    [
                        -1,
                        -0.5,
                    ],
                    [
                        0.5,
                        -1,
                    ],
                ],
            ],
            expectedOutput: [
                [
                    -0.5,
                    0.5,
                ],
            ],
        },
        {
            input: [
                [
                    -0.5,
                    0.5,
                ],
                [
                    [
                        -10,
                        -5,
                    ],
                    [
                        -0.5,
                        0.5,
                    ],
                    [
                        5,
                        10,
                    ],
                ],
            ],
            expectedOutput: [],
        },
    ];

    testCases.forEach(({
        input: [
            initialRange,
            sortedRangesToExclude,
        ], expectedOutput,
    }, i) => {
        test(`${i}`, () => {
            expect(excludeRanges(initialRange, sortedRangesToExclude)).toEqual(expectedOutput);
        });
    });
});
