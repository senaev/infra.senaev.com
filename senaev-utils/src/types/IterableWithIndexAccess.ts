export type IterableWithIndexAccess<T> = Iterable<T> & {
    length: number;
    at(index: number): T | undefined;
};
