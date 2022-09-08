import prand from 'pure-rand';
import { classNameFromFqn, lcfirst } from '../util';
import { CallableContext, ISourceBiaser, ValueLoc } from './source-bias';
import { FqnValueSource, ParameterSource, PrimitiveName, ValueSource, ValueSources } from './value-sources';
import { Argument, PrimitiveValue, Value } from './values';

export interface PlannerOptions {
  /**
   * Use variables to hold intermediate assignments
   *
   * @default false
   */
  readonly useVariables?: boolean;

  /**
   * Bias or replace the value sources sampled by the planner
   */
  readonly biaser?: ISourceBiaser;
}

export class Planner {
  private readonly statements = new Array<Statement>();
  private readonly varCtr = new Map<string, number>();
  private nestingLevel = 0;

  constructor(private readonly sources: ValueSources, public rng: prand.RandomGenerator, private readonly options: PlannerOptions = {}) {
  }

  public plan(fqn: string): Statement[] {
    const value = this.planFqn(fqn, []);
    return [
      ...this.statements,
      { type: 'expression', value },
    ];
  }

  public planMultiple(fqns: string[]): Statement[][] {
    return fqns.map(fqn => this.plan(fqn));
  }

  public planFqn(fqn: string, loc: ValueLoc[]): Value {
    const sources = this.sources.types[fqn];
    if (!sources) { throw new Error(`Unknown type: '${fqn}'`); }
    if (sources.length === 0) {
      throw new Error(`No constructors for type: '${fqn}'`);
    }

    return this.planNamedValue(sources, loc);
  }

  private planNamedValue(sources: FqnValueSource[], loc: ValueLoc[]): Value {
    const biased = this.options.biaser?.biasFqnValue(sources, loc) ?? sources;
    const source = this.pickFrom(biased);

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
          fields: this.withNesting(() => this.planFields(source.fqn, source.fields, loc)),
        };
      case 'constant':
        return source.value;
    }
  }

  private planValue(sources: ValueSource[], loc: ValueLoc[]): Value {
    const biased = this.options.biaser?.biasValue(sources, loc) ?? sources;
    const source = this.pickFrom(biased);

    switch (source.type) {
      case 'no-value':
        return { type: 'no-value' };
      case 'fqn':
        return this.maybeExtract(this.planFqn(source.fqn, loc), source.fqn);
      case 'primitive':
        return this.planPrimitive(source.primitive);
      case 'array':
        return this.planArray(source.elements, loc);
      case 'map':
        return this.planMap(source.elements, loc);
      case 'constant':
        return source.value;
    }
  }

  private planArguments(ps: ParameterSource[], loc: ValueLoc[], callable: CallableContext, startIndex = 0): Argument[] {
    const ret: Argument[] = [];
    for (let i = startIndex; i < ps.length; i++) {
      const p = ps[i];
      const value = this.planValue(p.value, [...loc, { type: 'argument', argumentIndex: i, argumentName: p.name, callable }]);
      if (value.type === 'no-value') {
        break;
      }
      ret.push({ name: p.name, value });
    }
    return ret;
  }

  private planPrimitive(p: PrimitiveName): PrimitiveValue {
    switch (p) {
      case 'string':
        return {
          type: 'primitive',
          primitive: 'string',
          value: this.pickFrom(['', 'abc']),
        };
      case 'number':
        return {
          type: 'primitive',
          primitive: 'number',
          value: this.pickFrom([0, 10, 100]),
        };
      case 'boolean':
        return {
          type: 'primitive',
          primitive: 'boolean',
          value: this.pickFrom([false, true]),
        };
      case 'json':
      case 'any':
        return {
          type: 'primitive',
          primitive: p,
          value: {
            some: { value: true },
          },
        };
      case 'date':
        return {
          type: 'primitive',
          primitive: 'date',
          value: new Date(0),
        };
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

  private planArray(elementSource: ValueSource[], loc: ValueLoc[]): Value {
    const [length, rng] = prand.uniformIntDistribution(0, 5)(this.rng);
    this.rng = rng;

    const elements: Value[] = [];
    for (let i = 0; i < length; i++) {
      elements.push(this.planValue(elementSource, [...loc, { type: 'array-element', index: i }]));
    }

    return { type: 'array', elements };
  }

  private planMap(elementSource: ValueSource[], loc: ValueLoc[]): Value {
    const [length, rng] = prand.uniformIntDistribution(0, 5)(this.rng);
    this.rng = rng;

    const fields: Record<string, Value> = {};
    for (let i = 0; i < length; i++) {
      const key = `key${i + 1}`;
      fields[key] = this.planValue(elementSource, [...loc, { type: 'map-entry', key }]);
    }

    return { type: 'object-literal', fields };
  }

  private planFields(fqn: string, fields: Record<string, ValueSource[]>, loc: ValueLoc[]): Record<string, Value> {
    const ret: Record<string, Value> = {};
    for (const [k, sources] of Object.entries(fields)) {
      const value = this.planValue(sources, [...loc, { type: 'struct-field', fqn, fieldName: k }]);
      if (value.type !== 'no-value') {
        ret[k] = value;
      }
    }
    return ret;
  }

  private isConstructParameters(ps: ParameterSource[]) {
    return (ps.length >= 2
      && ps[0].name === 'scope' && isSingleton(ps[0].value, isFqn('constructs.Construct'))
      && isSingleton(ps[1].value, isString));
  }

  private planConstructArguments(ps: ParameterSource[], idName: string, loc: ValueLoc[], callable: CallableContext): Argument[] {
    // FIXME: The biaser could/should be doing this. It would need to keep a list of already-defined constructs.
    return [
      { name: ps[0].name, value: { type: 'scope' } },
      { name: ps[1].name, value: { type: 'primitive', primitive: 'string', value: idName } },
      ...this.planArguments(ps, loc, callable, 2),
    ];
  }

  /**
   * Maybe extract the given value to a variable
   *
   * Only extract if extracting is turned on and we are in a nested context, and this value
   * is obtained from a method call or object instantiation.
   *
   * Return the value or the variable.
   */
  private maybeExtract(value: Value, namingHint: string): Value {
    // Not enabled
    if (!this.options.useVariables || this.nestingLevel === 0) { return value; }

    // Not necessary
    if (value.type !== 'class-instantiation' && value.type !== 'static-method-call') { return value; }

    const variableName = this.makeVariableName(namingHint);
    this.statements.push({ type: 'assignment', variableName, value });
    return { type: 'variable', variableName };
  }

  private makeVariableName(fqn: string) {
    const variableName = lcfirst(classNameFromFqn(fqn));
    const i = (this.varCtr.get(variableName) ?? 0) + 1;
    this.varCtr.set(variableName, i);
    return `${variableName}${i > 1 ? i : ''}`;
  }

  private withNesting<A>(x: () => A): A {
    this.nestingLevel += 1;
    try {
      return x();
    } finally {
      this.nestingLevel -= 1;
    }
  }
}

export type Statement =
  | Assignment
  | Expression
  ;

export interface Assignment {
  readonly type: 'assignment';
  readonly variableName: string;
  readonly value: Value;
}

export interface Expression {
  readonly type: 'expression';
  readonly value: Value;
}

function isSingleton<A>(xs: A[], pred: (x: A) => boolean) {
  return xs.length === 1 && pred(xs[0]);
}

function isFqn(fqn: string) {
  return (x: ValueSource) => x.type === 'fqn' && x.fqn === fqn;
}

function isString(x: ValueSource) {
  return x.type === 'primitive' && x.primitive === 'string';
}