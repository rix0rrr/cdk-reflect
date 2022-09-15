/* eslint-disable no-bitwise */
import prand from 'pure-rand';

/**
 * A wrapper around 'pure-rand' which mutates itself in-place
 */
export class Random {
  public static mersenneFromSeed(seed?: number) {
    return new Random(prand.mersenne(seed ?? Date.now()));
  }

  private readonly strides = new Map<number, number[]>();

  constructor(public rng: prand.RandomGenerator) {
  }

  public pickFrom<A>(xs: A[]): A {
    if (xs.length === 0) {
      throw new Error('Cannot pick from empty array');
    }

    const i = this.pickNr(0, xs.length - 1);
    return xs[i];
  }

  public pickNr(lo: number, hi: number): number {
    const [i, rng] = prand.uniformIntDistribution(lo, hi)(this.rng);
    this.rng = rng;
    return i;
  }

  public generateString(minlen: number, maxlen: number, alphabet: string) {
    const ret = new Array<string>();
    const len = this.pickNr(minlen, maxlen);
    for (let i = 0; i < len; i++) {
      ret.push(alphabet[this.pickNr(0, alphabet.length - 1)]);
    }
    return ret.join('');
  }

  /**
   * Fisher-Yates shuffle an array IN PLACE
   */
  public shuffleMutate<A>(xs: A[]): A[] {
    for (let i = xs.length - 1; i >= 1; i--) {
      const j = this.pickNr(0, i);
      const h = xs[i];
      xs[i] = xs[j];
      xs[j] = h;
    }
    return xs;
  }

  /**
   * Iterate randomly over the elements in xs
   */
  public* randomIteration<A>(xs: A[]): IterableIterator<[A, number]> {
    // Uses an LCG (i' = i * prime + offset mod N), where N = len(xs) and a is coprime with N to guarantee visiting every element exactly once
    // Doing this instead of shuffling a reified array of indexes yields about a 2x speedup in the mutation loop.
    if (xs.length === 0) { return; }
    if (xs.length === 1) {
      yield [xs[0], 0];
      return;
    }

    const N = xs.length;
    const offset = this.pickNr(0, xs.length - 1);
    const prime = this.selectStride(N);

    let index = offset;
    for (let i = 0; i < N; i++) {
      yield [xs[index], index];
      index += prime;
      if (index >= N) { index -= N; }
    }
  }

  /**
   * Select a stride for the given array that will visit every element exactly once
   *
   * Selects a coprime with the length of the array, uses a cache to avoid having to
   * do the coprime calculation every time.
   */
  private selectStride(n: number) {
    let strides = this.strides.get(n);
    if (!strides) {
      strides = this.calculateCoprimes(Math.floor(n / 2), n);
      this.strides.set(n, strides);
    }
    return this.pickFrom(strides);
  }

  /**
   * Return a set of (interesting) coprimes for a given target number
   */
  private calculateCoprimes(min: number, target: number): number[] {
    const ret = new Array<number>();
    let count = 0;
    for (let val = min; val < target; ++val) {
      if (gcd(val, target) == 1) { // Coprime
        count += 1;
        ret.push(val);
      };
      if (count == 100000) { break; }
    }
    return ret;
  }
}

function gcd(u: number, v: number) {
  let shift: number;
  if (u == 0) return v;
  if (v == 0) return u;
  for (shift = 0; ((u | v) & 1) == 0; ++shift) {
    u >>= 1;
    v >>= 1;
  }

  while ((u & 1) == 0) {
    u >>= 1;
  }

  do {
    while ((v & 1) == 0) {
      v >>= 1;
    }
    if (u > v) {
      let t = v;
      v = u;
      u = t;
    }
    v = v - u;
  } while (v != 0);
  return u << shift;
}
