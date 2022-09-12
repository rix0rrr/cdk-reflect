import prand from 'pure-rand';
import { range } from '../util';
import { ALPHABET_CHARS, MinimalValueGenerator, TypeSource } from './minimal';
import { ValueSource } from './value-sources';
import { Value, valueIsFromSource } from './values';
import { Zipper, zipperDelete, zipperDescend, zipperSet } from './zipper';

export interface MutatorOptions {
  /**
   * How many variants to generate
   *
   * @default 1
   */
  readonly variants?: number;
}

export class ValueMutator {
  private readonly proposedMutations: Mutation[];
  private n = 0;
  private readonly k: number;
  private readonly minimal: MinimalValueGenerator;

  constructor(private readonly types: TypeSource, public rng: prand.RandomGenerator, options: MutatorOptions = {}) {
    this.k = options.variants ?? 1;
    this.proposedMutations = new Array(this.k);
    this.minimal = new MinimalValueGenerator(types);
  }

  public mutate(fqn: string, value: Value): Value[] {
    this.mutateFqnValue(fqn, value, []);
    return this.proposedMutations.map(applyMutation);
  }

  /**
   * Use reservoir sampling to hold on to each proposed value with equal chance
   */
  private proposeMutation(v: Mutation) {
    const [x, rng] = prand.uniformIntDistribution(0, this.n++)(this.rng);
    this.rng = rng;
    if (x < this.k) {
      this.proposedMutations[x] = v;
    }
  }

  private proposeSet(zipper: Zipper, value: Value) {
    this.proposeMutation({ mutation: 'set', zipper, value });
  }

  private proposeDelete(zipper: Zipper) {
    this.proposeMutation({ mutation: 'delete', zipper });
  }

  private mutateFqnValue(fqn: string, value: Value, loc: Zipper) {
    const sources = this.types.lookupFqn(fqn);
    this.mutateValue(value, sources, loc);
  }

  private mutateValue(value: Value, sources: ValueSource[], zipper: Zipper) {
    const biasedSources = this.types.valueSources(sources, zipper);

    const currentSource = biasedSources.find(s => valueIsFromSource(value, s));

    // One possible mutation: use a different source
    for (const source of biasedSources) {
      if (source !== currentSource) {
        this.proposeSet(zipper, this.minimal.minimalValue([source], zipper));
      }
    }

    // FIXME: think about source.type == fqn here!!!!

    switch (value.type) {
      // Nothing about the access itself to mutate here.
      // Any mutation will have to relying on having picked a different source here.
      case 'scope':
      case 'no-value':
      case 'variable':
      case 'static-property':
        return;

      case 'array': {
        if (currentSource?.type !== 'array') { break; }

        // Add an element
        const addZipper = zipperDescend(zipper, value, value.elements.length);
        this.proposeSet(addZipper, this.minimal.minimalValue(currentSource.elements, addZipper));

        if (value.elements.length > 0) {
          // Remove or mutate an element
          const i = this.pickNr(0, value.elements.length - 1);
          const elZipper = zipperDescend(zipper, value, i);

          this.proposeDelete(elZipper);
          this.mutateValue(value.elements[i], currentSource.elements, elZipper);
        }
        break;
      }

      case 'class-instantiation':
      case 'static-method-call': {
        if (currentSource?.type !== value.type) { return; }

        // Add an argument if possible
        if (value.arguments.length < currentSource.parameters.length) {
          const newArgZipper = zipperDescend(zipper, value, value.arguments.length);
          this.proposeSet(newArgZipper, this.minimal.minimalValue(currentSource.parameters[value.arguments.length].value, newArgZipper));
        }

        // Find an argument to mutate (if (this.didMutate(...)) }
        if (value.arguments.length > 0) {
          const args = this.shuffleMutate(range(value.arguments.length));

          for (const arg of args) {
            const didP = this.didPropose(() => {
              const elZipper = zipperDescend(zipper, value, arg);
              this.mutateValue(value.arguments[arg].value, currentSource.parameters[arg].value, elZipper);
            });

            if (didP) { break; }
          }
        }

        break;
      }

      case 'object-literal': {
        if (currentSource?.type !== 'value-object') { return; }

        // Pick a random key and mutate it
        const keys = Object.keys(currentSource.fields);
        if (keys.length > 0) {
          const pickedKey = this.pickFrom(keys);

          const elZipper = zipperDescend(zipper, value, pickedKey);
          this.mutateValue(
            value.entries[pickedKey] ?? { type: 'no-value' },
            currentSource.fields[pickedKey],
            elZipper);
        }
        break;
      }

      case 'primitive':
        // Change the value of the primitive
        switch (value.primitive) {
          case 'boolean':
            this.proposeSet(zipper, { type: 'primitive', primitive: 'boolean', value: !value.value });
            break;
          case 'number': {
            // Mutate the number, keeping it an int because most numbers need to be ints
            const opnd = this.pickNr(1, 5);
            const op = this.pickFrom(['+', '-', '*', '/'] as Array<'+'|'-'|'*'|'/'>);

            let newValue: number;
            switch (op) {
              case '+': newValue = value.value + opnd; break;
              case '-': newValue = value.value - opnd; break;
              case '/': newValue = Math.round(value.value / opnd); break;
              case '*': newValue = value.value * opnd; break;
            }

            this.proposeSet(zipper, { type: 'primitive', primitive: 'number', value: newValue });
            break;
          }
          case 'string': {
            // Mutate the string
            const op = this.pickFrom(['slice', 'prepend', 'append'] as Array<'slice'|'prepend'|'append'>);
            let newValue;
            switch (op) {
              case 'prepend':
              case 'append':
                const str = this.generateString(1, 4, ALPHABET_CHARS);

                newValue = op === 'prepend' ? str + value.value : value.value + str;
                break;
              case 'slice':
                if (value.value.length > 0) {
                  const i = this.pickNr(0, value.value.length);
                  const len = this.pickNr(0, value.value.length - i);

                  newValue = value.value.substring(0, i) + value.value.substring(i + len);
                }
                break;
            }
            if (newValue) {
              this.proposeSet(zipper, { type: 'primitive', primitive: 'string', value: newValue });
            }
          }
        }
    }
  }

  private pickFrom<A>(xs: A[]): A {
    if (xs.length === 0) {
      throw new Error('Cannot pick from empty array');
    }

    const i = this.pickNr(0, xs.length - 1);
    return xs[i];
  }

  private pickNr(lo: number, hi: number): number {
    const [i, rng] = prand.uniformIntDistribution(lo, hi)(this.rng);
    this.rng = rng;
    return i;
  }

  private generateString(minlen: number, maxlen: number, alphabet: string) {
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
  private shuffleMutate<A>(xs: A[]): A[] {
    for (let i = xs.length - 1; i >= 1; i--) {
      const j = this.pickNr(0, i);
      const h = xs[i];
      xs[i] = xs[j];
      xs[j] = h;
    }
    return xs;
  }

  /**
   * Execute a block and return whether or not the block proposed any mutations
   */
  private didPropose(block: () => void): boolean {
    const start = this.n;
    block();
    return this.n > start;
  }
}

export type Mutation =
  | SetMutation
  | DeleteMutation
  ;

export interface SetMutation {
  readonly mutation: 'set';
  readonly zipper: Zipper;
  readonly value: Value;
}

export interface DeleteMutation {
  readonly mutation: 'delete';
  readonly zipper: Zipper;
}

function applyMutation(m: Mutation): Value {
  switch (m.mutation) {
    case 'set':
      return zipperSet(m.zipper, m.value);
    case 'delete':
      return zipperDelete(m.zipper);
  }
}