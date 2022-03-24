export function isDefined<A>(x: A): x is NonNullable<A> {
  return x != null;
}

const FAILSYM = Symbol('FAILED');

export type Failure = { readonly [FAILSYM]: true; reason: string };
export type Success<A> = { readonly [FAILSYM]: false; value: A };

export type Result<A> = Success<A> | Failure;

export function isSuccess<T>(x: Result<T>): x is Success<T> {
  return typeof x === 'object' && x && FAILSYM in x && !x[FAILSYM];
}

export function isFailure<T>(x: Result<T>): x is Failure {
  return typeof x === 'object' && x && (x as any)[FAILSYM];
}

export function failure<T>(reason: string): Result<T> {
  return { [FAILSYM]: true, reason };
}

export function success<T>(value: T): Result<T> {
  return { [FAILSYM]: false, value };
}

export function unwrapR<T>(value: Result<T>): T {
  if (isFailure(value)) {
    throw new Error(value.reason);
  }
  return value.value;
}

export function reasons<T>(xs?: Result<T>[]): string[] {
  return xs?.filter(isFailure).map(t => t.reason) ?? [];
}

export function liftR<T>(xs: Result<T>[]): Result<T[]> {
  const failures = xs.filter(isFailure);
  if (failures.length > 0) { return failure(reasons(failures).join(', ')); }
  return success(xs.map(unwrapR));
}

export type NonResult<A> = A extends Result<infer B> ? B : A;

export function liftObjR<B extends object>(x: B): Result<{ [k in keyof B]: NonResult<B[k]>}> {
  const ret: any = {};
  for (const [key, mem] of Object.entries(x)) {
    if (isFailure(mem)) { return failure(mem.reason); }
    ret[key] = isSuccess(mem) ? unwrapR(mem) : mem;
  }
  return success(ret);
}

export function partition<T>(xs: T[], pred: (x: T) => boolean): [T[], T[]] {
  const yes = new Array<T>();
  const no = new Array<T>();
  for (const x of xs) {
    (pred(x) ? yes : no).push(x);
  }
  return [yes, no];
}

export function mkdict<A>(xs: Array<[string, A]>): Record<string, A> {
  const ret: Record<string, A> = {};
  for (const [key, value] of xs) {
    ret[key] = value;
  }
  return ret;
}
