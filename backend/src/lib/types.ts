// backend/src/lib/types.ts

export type PrimitiveScalar = string | number | boolean | bigint;

export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & {
  readonly [brand]: B;
};
