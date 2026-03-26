type Trim<S extends string> = S extends ` ${infer T}`
    ? Trim<T>
    : S extends `${infer T} `
      ? Trim<T>
      : S;

export type SplitCommaAndTrim<S extends string> = S extends `${infer Head},${infer Tail}`
    ? Trim<Head> | SplitCommaAndTrim<Tail>
    : Trim<S>;
