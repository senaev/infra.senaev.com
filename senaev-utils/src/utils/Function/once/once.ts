/**
 * Обертка для функции, которая вызовется не больше одного раза
 *
 * Контекст вызова сохраняется
 *
 * При повторных вызовах возвращается результат первого вызова
 *
 * Повторные рекурсивные вызовы срабатывать тоже не будут
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function once<T extends (this: any, ...args: any[]) => any>(this: any, fn: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let onceFn = function (this: any) {
        // Заранее создаем переменную, чтобы при вызове не было ошибки обращения к несуществующей константе
        // eslint-disable-next-line prefer-const, @typescript-eslint/no-explicit-any
        let result: any;

        // Заранее перезаписываем функцию, чтобы избежать рекурсивного вызова внутри once
        onceFn = () => result;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
        result = fn.apply(this, arguments as any);

        return result;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (this: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
        return onceFn.apply(this, arguments as any);
    } as T;
}
