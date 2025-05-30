/**
 * Метод организует всплытие ошибки до глобального скоупа без прерывания текущего коллстека
 */
export function rethrowError(error: Error): void {
    setTimeout(() => {
        throw error;
    }, 0);
}
