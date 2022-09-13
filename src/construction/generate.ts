import { ICustomDistribution } from './custom-distribution';
import { DistributionOps } from './distribution-ops';
import { DistributionRef, ParameterSource, PrimitiveName, ResolvedValueSource, ValueModel } from './distributions';
import { Random } from './random';
import { Zipper, zipperDescend } from './value-zipper';
import { ClassInstantiation, DistPtr, StaticMethodCall, StructLiteral, Value } from './values';

export interface GeneratorOptions {
  /**
   * Custom distributions
   */
  readonly customDistributions?: Record<string, ICustomDistribution>;
}

export class ValueGenerator {
  protected readonly query: DistributionOps;
  protected readonly customDistributions: Map<string, ICustomDistribution>;

  constructor(model: ValueModel, protected readonly random: Random, options: GeneratorOptions = {}) {
    this.query = new DistributionOps(model);
    this.customDistributions = new Map(Object.entries(options.customDistributions ?? {}));
  }

  public minimal(fqn: string): Value {
    return this.minimalValue(this.query.recordDistribution([{ type: 'fqn', fqn }]), []);
  }

  protected minimalValue(dist: DistributionRef, loc: Zipper): Value {
    const src = this.query.resolveDist(dist)[0];
    const source: DistPtr = { distId: dist.distId, sourceIndex: 0 };
    return this.minimalValueFromSource(src, source, loc);
  }

  protected minimalValueFromSource(source: ResolvedValueSource, distPtr: DistPtr, loc: Zipper): Value {
    switch (source.type) {
      case 'class-instantiation': {
        console.log('class instantiation', source.fqn);
        return this.fillMinimalArguments(source.parameters, loc, {
          type: 'class-instantiation',
          fqn: source.fqn,
          distPtr,
          parameterNames: source.parameters.map(p => p.name),
          arguments: [],
        });
      }
      case 'static-method-call': {
        console.log('static method call', source.fqn);
        return this.fillMinimalArguments(source.parameters, loc, {
          type: 'static-method-call',
          fqn: source.fqn,
          distPtr,
          staticMethod: source.staticMethod,
          parameterNames: source.parameters.map(p => p.name),
          arguments: [],
          targetFqn: source.targetFqn,
        });
      }
      case 'static-property':
        return {
          type: 'static-property',
          fqn: source.fqn,
          distPtr,
          staticProperty: source.staticProperty,
          targetFqn: source.targetFqn,
        };
      case 'value-object':
        return this.fillMinimalFields(source.fields, loc, {
          type: 'object-literal',
          distPtr,
          fqn: source.fqn,
          entries: {},
        });
      case 'constant':
        return source.value;
      case 'no-value':
        return { type: 'no-value', distPtr };
      case 'primitive':
        return this.minimalPrimitive(source.primitive, distPtr);
      case 'array':
        return { type: 'array', distPtr, elements: [] };
      case 'map':
        return { type: 'map-literal', distPtr, entries: {} };
      case 'constant':
        return source.value;
      case 'custom':
        return this.custom(source.sourceName).minimalValue(distPtr, loc, source);
    }
  }

  protected custom(name: string) {
    const d = this.customDistributions.get(name);
    if (!d) {
      throw new Error(`Unknown custom distribution: ${name}`);
    }
    return d;
  }

  private fillMinimalArguments(ps: ParameterSource[], loc: Zipper, baseValue: ClassInstantiation | StaticMethodCall): Value {
    let i = 0;
    for (; i < ps.length; i++) {
      const p = ps[i];
      const arg = this.minimalValue(p.dist, zipperDescend(loc, baseValue, i));
      if (arg.type === 'no-value') { break; }
      baseValue.arguments.push(arg);
    }

    // If we've stopped generating values, fill the rest up with 'no-value's.
    for (; i < ps.length; i++) {
      baseValue.arguments.push({
        type: 'no-value',
        distPtr: {
          distId: ps[i].dist.distId,
          sourceIndex: 0, // FIXME: This might be wrong? I'm just assuming it's going to be value 0.
        },
      });
    }

    return baseValue;
  }

  private minimalPrimitive(p: PrimitiveName, source: DistPtr): Value {
    switch (p) {
      case 'string':
        return {
          type: 'primitive',
          distPtr: source,
          primitive: 'string',
          value: this.random.generateString(1, 10, ALPHABET_CHARS),
        };
      case 'number':
        return {
          type: 'primitive',
          distPtr: source,
          primitive: 'number',
          value: this.random.pickNr(1, 10),
        };
      case 'boolean':
        return {
          type: 'primitive',
          distPtr: source,
          primitive: 'boolean',
          value: false,
        };
      case 'json':
      case 'any':
        return {
          type: 'map-literal',
          distPtr: source,
          entries: {},
        };
      case 'date':
        return {
          type: 'primitive',
          distPtr: source,
          primitive: 'date',
          value: new Date(0),
        };
    }
  }

  private fillMinimalFields(fields: Record<string, DistributionRef>, loc: Zipper, baseStruct: StructLiteral): Value {
    for (const [k, ref] of Object.entries(fields)) {
      const value = this.minimalValue(ref, zipperDescend(loc, baseStruct, k));
      if (value.type !== 'no-value') {
        baseStruct.entries[k] = value;
      }
    }
    return baseStruct;
  }
}

export const ALPHABET_CHARS = '-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01923456789 _:$';