export type ObjectKeysMirror<T extends Record<string, unknown>> = { [key in keyof T]: key };
