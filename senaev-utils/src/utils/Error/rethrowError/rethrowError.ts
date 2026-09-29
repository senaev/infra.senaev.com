/**
 * The method bubbles the error up to the global scope without interrupting the current call stack
 */
export function rethrowError(error: Error): void {
    setTimeout(() => {
        throw error;
    }, 0);
}
