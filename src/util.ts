export function isDefined<A>(x: A): x is NonNullable<A> {
  return x != null;
}

const FAILSYM = Symbol('FAILED');

export type Failure = { readonly [FAILSYM]: true; reason: string };

export type Result<A> = A | Failure;

export function isSuccess<T>(x: Result<T>): x is T {
  return typeof x === 'object' && x && !(FAILSYM in x);
}

export function isFailure<T>(x: Result<T>): x is Failure {
  return typeof x === 'object' && x && (x as any)[FAILSYM];
}

export function failure(reason: string): Failure {
  return { [FAILSYM]: true, reason };
}

export function prependFailure(reason: string, f: Failure): Failure {
  return failure(`${reason}: ${f.reason}`);
}

export function unwrap<T>(value: Result<T>): T {
  if (isFailure(value)) {
    throw new Error(value.reason);
  }
  return value;
}

export function unwrapOr<T>(value: Result<T>, def: T): T {
  return isFailure(value) ? def : value;
}

export function apply<T, U>(value: Result<T>, fn: (x: T) => U | Result<U>): Result<U> {
  return isFailure(value) ? value : fn(value);
}

export function reasons<T>(xs?: Result<T>[]): string[] {
  return xs?.filter(isFailure).map(t => t.reason) ?? [];
}

export function liftR<T>(xs: Result<T>[]): Result<T[]> {
  const failures = xs.filter(isFailure);
  if (failures.length > 0) { return failure(reasons(failures).join(', ')); }
  return xs as Result<T[]>;
}

export type NonResult<A> = A extends Result<infer B> ? B : A;

export function liftObjR<B extends object>(x: B): Result<{ [k in keyof B]: NonResult<B[k]>}> {
  const ret: any = {};
  for (const [key, mem] of Object.entries(x)) {
    if (isFailure(mem)) { return failure(mem.reason); }
    ret[key] = isSuccess(mem) ? unwrap(mem) : mem;
  }
  return ret;
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

export function classNameFromFqn(fqn: string) {
  const xs = fqn.split('.');
  return xs[xs.length - 1];
}

export function lcfirst(x: string) {
  return x.substring(0, 1).toLowerCase() + x.substring(1);
}

export function assertSwitchIsExhaustive(x: never): never {
  void(x);
  throw new Error("Didn't expect to get here");
}

export function indent(x: string, ind: string = '  '): string {
  return ind + x.replace(/\n/g, `\n${ind}`);
}

export function mapValues<A, B>(xs: Record<string, A>, fn: (x: A) => B): Record<string, B> {
  return Object.fromEntries(Object.entries(xs).map(([k, v]) => [k, fn(v)]));
}

export function range(n: number): number[] {
  const ret = new Array<number>();
  for (let i = 0; i < n; i++) {
    ret.push(i);
  }
  return ret;
}

export function enumerate<A>(xs: A[]): Array<[A, number]> {
  const ret = new Array();
  for (let i = 0; i < xs.length; i++) {
    ret.push([xs[i], i]);
  }
  return ret;
}

/**
 * Runs a block and returns the result plus the time it took, in seconds
 */
export function timed<A>(block: () => A): [number, A] {
  const startTime = Date.now();
  const ret = block();
  const endTime = Date.now();

  return [(endTime - startTime) / 1000, ret];
}