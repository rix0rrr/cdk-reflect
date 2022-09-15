import prand from 'pure-rand';
import { range } from '../util';

/**
 * A wrapper around 'pure-rand' which mutates itself in-place
 */
export class Random {
  public static mersenneFromSeed(seed?: number) {
    return new Random(prand.mersenne(seed ?? Date.now()));
  }

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

  public randomIteration<A>(xs: A[]): Array<[A, number]> {
    return this.shuffleMutate(range(xs.length)).map(i => [xs[i], i]);
  }
}