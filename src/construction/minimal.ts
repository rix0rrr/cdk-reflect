import { ISourceBiaser } from './biasing';
import { FqnValueSource, ParameterSource, PrimitiveName, ValueSource, ValueSources } from './value-sources';
import { ClassInstantiation, StaticMethodCall, StructLiteral, Value } from './values';
import { Zipper, zipperDescend } from './zipper';

export interface TypeSourceOptions {
  /**
   * Bias or replace the value sources sampled by the planner
   */
  readonly biaser?: ISourceBiaser;
}

export class TypeSource {
  constructor(private readonly sources: ValueSources, private readonly options: TypeSourceOptions = {}) {
  }

  public fqnValueSources(fqn: string, loc: Zipper): FqnValueSource[] {
    const sources = this.sources.types[fqn];
    if (!sources) { throw new Error(`Unknown type: '${fqn}'`); }
    if (sources.length === 0) {
      throw new Error(`No constructors for type: '${fqn}'`);
    }
    const biased = this.options.biaser?.biasFqnValue(sources, loc) ?? sources;
    if (biased.length === 0) {
      throw new Error(`After biasing, no constructors for type: '${fqn}'`);
    }
    return biased;
  }

  public valueSources(sources: ValueSource[], loc: Zipper): ValueSource[] {
    const biased = this.options.biaser?.biasValue(sources, loc) ?? sources;
    if (biased.length === 0) {
      throw new Error('After biasing, no constructors anymore');
    }
    return biased;
  }

  public parameterSources(fqn: string, sources: ParameterSource[], loc: Zipper): ParameterSource[] {
    return this.options.biaser?.biasArguments(fqn, sources, loc) ?? sources;
  }
}


export class MinimalValueGenerator {
  constructor(private readonly types: TypeSource) {
  }

  public generate(fqn: string): Value {
    return this.minimalFqnValue(fqn, []);
  }

  private minimalFqnValue(fqn: string, loc: Zipper): Value {
    const source = this.types.fqnValueSources(fqn, [])[0];

    switch (source.type) {
      case 'class-instantiation': {
        return this.fillMinimalArguments(this.types.parameterSources(fqn, source.parameters, loc), loc, {
          type: 'class-instantiation',
          fqn: source.fqn,
          arguments: [],
        });
      }
      case 'static-method-call': {
        return this.fillMinimalArguments(this.types.parameterSources(fqn, source.parameters, loc), loc, {
          type: 'static-method-call',
          fqn: source.fqn,
          staticMethod: source.staticMethod,
          arguments: [],
        });
      }
      case 'static-property':
        return {
          type: 'static-property',
          fqn: source.fqn,
          staticProperty: source.staticProperty,
        };
      case 'value-object':
        return this.fillMinimalFields(source.fields, loc, {
          type: 'object-literal',
          fqn: source.fqn,
          entries: {},
        });
      case 'constant':
        return source.value;
    }
  }

  private minimalValue(sources: ValueSource[], loc: Zipper): Value {
    const source = this.types.valueSources(sources, loc)[0];

    switch (source.type) {
      case 'no-value':
        return { type: 'no-value' };
      case 'fqn':
        return this.minimalFqnValue(source.fqn, loc);
      case 'primitive':
        return this.minimalPrimitive(source.primitive);
      case 'array':
        return { type: 'array', elements: [] };
      case 'map':
        return { type: 'map-literal', entries: {} };
      case 'constant':
        return source.value;
    }
  }

  private fillMinimalArguments(ps: ParameterSource[], loc: Zipper, baseValue: ClassInstantiation | StaticMethodCall): Value {
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const arg = this.minimalValue(p.value, zipperDescend(loc, baseValue, i));
      if (arg.type === 'no-value') { break; }
      baseValue.arguments.push({ name: p.name, value: arg });
    }
    return baseValue;
  }

  private minimalPrimitive(p: PrimitiveName): Value {
    switch (p) {
      case 'string':
        return {
          type: 'primitive',
          primitive: 'string',
          value: 'abc',
        };
      case 'number':
        return {
          type: 'primitive',
          primitive: 'number',
          value: 10,
        };
      case 'boolean':
        return {
          type: 'primitive',
          primitive: 'boolean',
          value: false,
        };
      case 'json':
      case 'any':
        return {
          type: 'map-literal',
          entries: {},
        };
      case 'date':
        return {
          type: 'primitive',
          primitive: 'date',
          value: new Date(0),
        };
    }
  }

  private fillMinimalFields(fields: Record<string, ValueSource[]>, loc: Zipper, baseStruct: StructLiteral): Value {
    for (const [k, sources] of Object.entries(fields)) {
      const value = this.minimalValue(sources, zipperDescend(loc, baseStruct, k));
      if (value.type !== 'no-value') {
        baseStruct.entries[k] = value;
      }
    }
    return baseStruct;
  }
}
