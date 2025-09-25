import {
    describe, expect,
    it,
    vi,
} from 'vitest';

import { callFunctions } from './callFunctions';

describe('callFunctions', () => {
    it('simple case', () => {
        const functions = [
            vi.fn(),
            vi.fn(),
            vi.fn(),
        ];

        callFunctions(functions);

        functions.forEach((func) => {
            expect(func.mock.calls.length).to.eql(1);
        });

        callFunctions(functions);

        functions.forEach((func) => {
            expect(func.mock.calls.length).to.eql(2);
        });
    });

    it('call with arguments', () => {
        const functions = [
            vi.fn(),
            vi.fn(),
            vi.fn(),
        ] as ((
            a: number,
            b: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) => any)[];

        callFunctions(functions, 1, '2');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        functions.forEach((func: any) => {
            if (func && func.calls) {
                expect(func.getCalls().length).to.eql(1);

                const [
                    a,
                    b,
                    c,
                ] = func.getCalls()[0].args;

                expect(a).to.equal(1);
                expect(b).to.equal('2');
                expect(c).to.equal(undefined);
            }
        });
    });
});
