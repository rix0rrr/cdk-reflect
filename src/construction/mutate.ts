import { assertSwitchIsExhaustive, range } from '../util';
import { DistributionRef, ResolvedValueSource, ValueModel } from './distributions';
import { ALPHABET_CHARS, ValueGenerator, GeneratorOptions } from './generate';
import { Random } from './random';
import { Zipper, zipperDelete, zipperDescend, zipperSet } from './value-zipper';
import { DistPtr, PrimitiveValue, Value } from './values';

export interface MutatorOptions extends GeneratorOptions {
  /**
   * How many variants to generate
   *
   * @default 1
   */
  readonly variants?: number;
}

export class ValueMutator extends ValueGenerator {
  private readonly proposedMutations: Mutation[];
  private n = 0;
  private readonly k: number;

  constructor(model: ValueModel, random: Random, options: MutatorOptions = {}) {
    super(model, random, options);

    this.k = options.variants ?? 1;
    this.proposedMutations = new Array(this.k);
  }

  public mutate(value: Value): Value[] {
    if (this.n > 0) {
      throw new Error('You can only call mutate once!');
    }

    this.mutateValue(value, []);
    return this.proposedMutations.map(applyMutation);
  }

  /**
   * Use reservoir sampling to hold on to each proposed value with equal chance
   */
  private proposeMutation(v: Mutation) {
    const x = this.random.pickNr(0, this.n++);
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

  private mutateValue(value: Value, zipper: Zipper) {
    // One possible mutation: use a different source from the same distribution
    let source: ResolvedValueSource | undefined;

    if (valueHasDistPtr(value)) {
      const sources = this.query.resolveDist(value.distPtr);
      source = sources[value.distPtr.sourceIndex];

      sources.forEach((s, i) => {
        if (i !== value.distPtr.sourceIndex) {
          const newDistPtr = { distId: value.distPtr.distId, sourceIndex: i };
          this.proposeSet(zipper, this.minimalValueFromSource(s, newDistPtr, zipper));
        }
      });
    }

    if (!source) { return; }

    switch (source.type) {
      // Nothing about the access itself to mutate here.
      // Any mutation will have to relying on having picked a different source here.
      case 'no-value':
      case 'static-property':
      case 'constant':
        return;

      case 'array': {
        if (value.type !== 'array') { return; }

        // Add an element
        this.proposeNewMinimalValue(zipperDescend(zipper, value, value.elements.length), source.elements);

        if (value.elements.length > 0) {
          // Remove or mutate an element
          const i = this.random.pickNr(0, value.elements.length - 1);
          const elZipper = zipperDescend(zipper, value, i);

          this.proposeDelete(elZipper);
          this.mutateValue(value.elements[i], elZipper);
        }
        return;
      }

      case 'map': {
        if (value.type !== 'map-literal') { return; }

        // Add, remove, or mutate a key
        const newKey = this.random.generateString(1, 10, ALPHABET_CHARS);
        this.proposeNewMinimalValue(zipperDescend(zipper, value, newKey), source.elements);

        const keys = Object.keys(value.entries);
        if (keys.length > 0) {
          // Remove or mutate an element
          const randomKey = this.random.pickFrom(keys);
          const elZipper = zipperDescend(zipper, value, randomKey);

          this.proposeDelete(elZipper);
          this.mutateValue(value.entries[randomKey], elZipper);
        }
        return;
      }

      case 'class-instantiation':
      case 'static-method-call': {
        if (source.type !== value.type) { return; }

        // Add an argument if possible
        if (value.arguments.length < source.parameters.length) {
          const newArgZipper = zipperDescend(zipper, value, value.arguments.length);
          this.proposeSet(newArgZipper, this.minimalValue(source.parameters[value.arguments.length].dist, newArgZipper));
        }

        // Find an argument to mutate (if (this.didMutate(...)) }
        if (value.arguments.length > 0) {
          const args = this.random.shuffleMutate(range(value.arguments.length));

          for (const arg of args) {
            if (arg == 2) {
              debugger;
            }

            const didP = this.didPropose(() => {
              const elZipper = zipperDescend(zipper, value, arg);
              this.mutateValue(value.arguments[arg], elZipper);
            });

            if (didP) { return; }
          }
        }

        return;
      }

      case 'value-object':
        if (value.type !== 'object-literal') { return; }

        // Randomly mutate all keys. Get them from the source, the value might have been populated sparsely
        for (const [key, entryValue] of Object.entries(value.entries)) {
          const elZipper = zipperDescend(zipper, value, key);
          this.mutateValue(entryValue, elZipper);
        }
        return;

      case 'primitive':
        if (value.type !== 'primitive') { return; }

        const newValue = this.mutatePrimitiveValue(value);
        this.proposeSet(zipper, { ...value, value: newValue as any });
        return;

      case 'custom':
        this.custom(source.sourceName).mutate(value, zipper, {
          proposeDelete: this.proposeDelete.bind(this),
          proposeSet: this.proposeSet.bind(this),
        });
        break;

      default:
        assertSwitchIsExhaustive(source);
    }
  }

  /**
   * Execute a block and return whether or not the block proposed any mutations
   */
  private didPropose(block: () => void): boolean {
    const start = this.n;
    block();
    return this.n > start;
  }

  private proposeNewMinimalValue(zipper: Zipper, distRef: DistributionRef) {
    this.proposeSet(zipper, this.minimalValue(distRef, zipper));
  }

  private mutatePrimitiveValue<A extends PrimitiveValue>(primitive: A): A['value'] {
    switch (primitive.primitive) {
      case 'boolean':
        return !primitive.value;
      case 'number': {
        // Mutate the number, keeping it an int because most numbers need to be ints
        const opnd = this.random.pickNr(1, 5);
        const op = this.random.pickFrom(['+', '-', '*', '/'] as Array<'+'|'-'|'*'|'/'>);

        switch (op) {
          case '+': return primitive.value + opnd;
          case '-': return primitive.value - opnd;
          case '/': return Math.round(primitive.value / opnd);
          case '*': return primitive.value * opnd;
        }
      }
      case 'string': {
        // Mutate the string
        const op = this.random.pickFrom(['slice', 'prepend', 'append'] as Array<'slice'|'prepend'|'append'>);
        switch (op) {
          case 'prepend':
          case 'append':
            const str = this.random.generateString(1, 4, ALPHABET_CHARS);

            return op === 'prepend' ? str + primitive.value : primitive.value + str;
          case 'slice':
            if (primitive.value.length > 0) {
              const i = this.random.pickNr(0, primitive.value.length);
              const len = this.random.pickNr(0, primitive.value.length - i);

              return primitive.value.substring(0, i) + primitive.value.substring(i + len);
            }
        }
      }
    }

    return primitive.value;
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

function valueHasDistPtr(v: Value): v is Extract<Value, { distPtr: DistPtr }> {
  return v.type !== 'variable';
}