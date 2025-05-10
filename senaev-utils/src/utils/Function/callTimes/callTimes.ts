export function callTimes(times: number, fn: (index: number) => void): void {
    for (let index = 0; index < times; index++) {
        fn(index);
    }
}
