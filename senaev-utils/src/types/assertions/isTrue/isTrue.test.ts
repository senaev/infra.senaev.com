import {
    describe,
    it,
} from 'vitest';

import { IsEqualUnion } from '../../IsEqualUnion';
import { ANY_VALUE } from '../ANY_VALUE';

import { isTrue } from './isTrue';

type StringLiteral1 = 'a' | 'b' | 'c';

type StringLiteral2 = 'a' | 'b' | 'c';

type StringLiteralWithAdditionalValue = 'a' | 'b' | 'c' | 'd';

type StringLiteralWithMissingValue = 'a' | 'b';

type StringLiteralWithDifferentValue = 'a' | 'b' | 'C';

describe('isTrue', () => {
    it('should assert true values', () => {
        isTrue(ANY_VALUE as IsEqualUnion<StringLiteral1, StringLiteral2>);

        // @ts-expect-error -- should show error is there's additional value
        isTrue(ANY_VALUE as IsEqualUnion<StringLiteral1, StringLiteralWithAdditionalValue>);

        // @ts-expect-error -- should show error is there's missing value
        isTrue(ANY_VALUE as IsEqualUnion<StringLiteral1, StringLiteralWithMissingValue>);

        // @ts-expect-error -- should show error is there's different value
        isTrue(ANY_VALUE as IsEqualUnion<StringLiteral1, StringLiteralWithDifferentValue>);
    });
});
