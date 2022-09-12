import prand from 'pure-rand';
import { classNameFromFqn } from '../util';
import { TypeSource } from './minimal';
import { FqnValueSource, ParameterSource, PrimitiveName, ValueSource, ValueSources } from './value-sources';
import { ClassInstantiation, StaticMethodCall, StructLiteral, Value } from './values';
import { Zipper, zipperDelete, zipperSet } from './zipper';

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

  constructor(private readonly types: TypeSource, public rng: prand.RandomGenerator, options: MutatorOptions = {}) {
    this.k = options.variants ?? 1;
    this.proposedMutations = new Array(this.k);
  }

  public mutate(fqn: string, value: Value): Value[] {
    this.mutateValue(fqn, value, []);
    return this.proposedMutations.map(applyMutation);
  }

  private mutateValue(fqn: string, value: Value, loc: Zipper) {
    switch (value.type) {
      // Nothing to mutate here
      case 'scope':
      case 'no-value':
        return value;

      case 'array':
      case 'class-instantiation':
      case 'object-literal':
      case 'primitive':
      case 'static-method-call':
      case 'static-property':
      case 'variable':
    }
  }

  private mutateFqnValue(value: Value, sources: FqnValueSource[], loc: Zipper): Value {
    const source = sources[0];

    switch (source.type) {
      case 'class-instantiation': {
        const callableContext: CallableContext = { type: 'class-instantiation', fqn: source.fqn };
        return {
          type: 'class-instantiation',
          fqn: source.fqn,
          arguments: this.isConstructParameters(source.parameters)
            ? this.planConstructArguments(source.parameters, `My${classNameFromFqn(source.fqn)}`, loc, callableContext)
            : this.planArguments(source.parameters, loc, callableContext),
        };
      }
      case 'static-method-call': {
        const callableContext: CallableContext = { type: 'static-method-call', fqn: source.fqn, staticMethod: source.staticMethod };
        return {
          type: 'static-method-call',
          fqn: source.fqn,
          staticMethod: source.staticMethod,
          arguments: this.isConstructParameters(source.parameters)
            ? this.planConstructArguments(source.parameters, `My${source.staticMethod}`, loc, callableContext)
            : this.planArguments(source.parameters, loc, callableContext),
        };
      }
      case 'static-property':
        return {
          type: 'static-property',
          fqn: source.fqn,
          staticProperty: source.staticProperty,
        };
      case 'value-object':
        return {
          type: 'object-literal',
          fields: this.planFields(source.fqn, source.fields, loc),
        };
      case 'constant':
        return source.value;
    }
  }

  private pickFrom<A>(xs: A[]): A {
    if (xs.length === 0) {
      throw new Error('Cannot pick from empty array');
    }

    const [i, rng] = prand.uniformIntDistribution(0, xs.length - 1)(this.rng);
    this.rng = rng;
    return xs[i];
  }

  private planArray(elementSource: ValueSource[], loc: Zipper): Value {
    const [length, rng] = prand.uniformIntDistribution(0, 5)(this.rng);
    this.rng = rng;

    const elements: Value[] = [];
    for (let i = 0; i < length; i++) {
      elements.push(this.planValue(elementSource, [{ type: 'array-element', index: i }, ...loc]));
    }

    return { type: 'array', elements };
  }

  private planMap(elementSource: ValueSource[], loc: Zipper): Value {
    const [length, rng] = prand.uniformIntDistribution(0, 5)(this.rng);
    this.rng = rng;

    const fields: Record<string, Value> = {};
    for (let i = 0; i < length; i++) {
      const key = `key${i + 1}`;
      fields[key] = this.planValue(elementSource, [{ type: 'map-entry', key }, ...loc]);
    }
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