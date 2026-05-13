import {
    describe,
    expect,
    test,
} from 'vitest';

import { omitKeys } from './omitKeys';

describe('omitKeys', () => {
    test('should omit requested keys', () => {
        expect(omitKeys({
            foo: 1,
            bar: 2,
            baz: 3,
        }, [
            'bar',
            'baz',
        ])).to.eql({
            foo: 1,
        });
    });

    test('should return same object shape when no keys omitted', () => {
        expect(omitKeys({
            foo: 1,
            bar: 2,
        }, [])).to.eql({
            foo: 1,
            bar: 2,
        });
    });

    test('should preserve omitted keys typing', () => {
        type User = {
            id: string;
            name: string;
            age?: number;
        };

        type UserWithoutId = {
            name: string;
            age?: number;
        };

        const user: User = {
            id: '1',
            name: 'John',
            age: 30,
        };

        const expectUserWithoutId = (_value: UserWithoutId) => undefined;

        const maybeUserWithoutId: UserWithoutId = omitKeys(user, ['id']);

        expectUserWithoutId(maybeUserWithoutId);
        expect(maybeUserWithoutId).to.eql({
            name: 'John',
            age: 30,
        });
    });
});
