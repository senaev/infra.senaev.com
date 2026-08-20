export function requestAnimationFramePromise() {
    return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
            resolve();
        });
    });
}
