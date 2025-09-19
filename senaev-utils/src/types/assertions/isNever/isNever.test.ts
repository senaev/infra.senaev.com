import {
    describe,
    expect,
    it,
} from 'vitest';

import { isNever } from './isNever';

describe('isNever', () => {
    it('should work in exhaustive switch statement scenarios', () => {
        enum TestEnum {
            ONE = 'one',
            TWO = 'two',
            THREE = 'three',
        }

        // This function should compile without errors (exhaustive)
        const exhaustiveHandler = (value: TestEnum): string => {
            switch (value) {
            case TestEnum.ONE:
                return 'first';
            case TestEnum.TWO:
                return 'second';
            case TestEnum.THREE:
                // @ts-expect-error -- should NOT be "never" here
                isNever(value);

                return 'third';
            default:
                isNever(value); // Should not cause type error

                return 'unreachable';
            }
        };

        // Test that all enum values are handled
        expect(exhaustiveHandler(TestEnum.ONE)).toBe('first');
        expect(exhaustiveHandler(TestEnum.TWO)).toBe('second');
        expect(exhaustiveHandler(TestEnum.THREE)).toBe('third');
    });
});
