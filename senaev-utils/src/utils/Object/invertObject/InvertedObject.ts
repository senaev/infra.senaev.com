export type InvertedObject<T extends Record<string, string>> = {
    [key in T[keyof T]]: keyof T;
};
