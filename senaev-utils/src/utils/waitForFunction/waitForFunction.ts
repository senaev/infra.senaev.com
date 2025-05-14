import { tryCatch } from '../Function/tryCatch/tryCatch';

export function waitForFunction(
    condition: () => boolean,
    {
        timeout = 250,
        interval = 10,
        message = `waitForFunction timeout ${timeout}ms`,
    }: Partial<
        Readonly<{
            timeout: number;
            interval: number;
            message: string;
        }>
    > = {}
): Promise<void> {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line prefer-const
        let intervalId: ReturnType<typeof setInterval>;
        // eslint-disable-next-line prefer-const
        let timeoutId: ReturnType<typeof setTimeout>;

        const clear = () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };

        const rejectWithClear = (error: Error) => {
            clear();
            reject(error);
        };

        const check = () => {
            if (tryCatch(condition, rejectWithClear) === true) {
                resolve(undefined);
                clear();
            }
        };

        intervalId = setInterval(() => {
            check();
        }, interval);

        timeoutId = setTimeout(() => {
            rejectWithClear(new Error(message));
        }, timeout);

        check();
    });
}
