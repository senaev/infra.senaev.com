/**
 * Used for checking type assertions
 *
 *
 * type IsEqualUnion<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false;
 *
 * type StringLiteralA = 'a' | 'b' | 'c';
 *
 * type StringLiteralB = 'a' | 'b' | 'c';
 *
 * isTrue(ANY_VALUE as IsEqualUnion<StringLiteralA, StringLiteralB>);
 */
export function isTrue(_: true) {}
