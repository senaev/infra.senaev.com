export function throttleWithPromiseFunction(callback: VoidFunction, promiseFunction: () => Promise<void>) {
    let isRunning = false;

    const throttled = () => {
        if (isRunning) {
            return;
        }

        isRunning = true;

        promiseFunction().finally(() => {
            callback();

            isRunning = false;
        });
    };

    return throttled;
}
