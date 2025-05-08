import { Subject, throttleTime } from 'rxjs';

import { Milliseconds } from '../../../types/Time/Milliseconds';

export function throttleFunction(func: VoidFunction, delay: Milliseconds): VoidFunction {
    const subject = new Subject();

    subject
        .pipe(throttleTime(delay, undefined, {
            leading: true,
            trailing: true,
        }))
        .subscribe(func);

    return () => {
        subject.next(undefined);
    };
}
