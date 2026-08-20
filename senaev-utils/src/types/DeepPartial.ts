export type DeepPartial<T> = T extends string ? T : { [key in keyof T]?: DeepPartial<T[key]> };
