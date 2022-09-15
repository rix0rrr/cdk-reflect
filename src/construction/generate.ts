import { apply, isFailure, Result, unwrap, prependFailure, failure } from '../util';
import { ICustomDistribution } from './custom-distribution';
import { DistributionOps } from './distribution-ops';
import { DistributionRef, ParameterSource, PrimitiveName, ResolvedValueSource, ValueModel } from './distributions';
import { Random } from './random';
import { Zipper, zipperDescend } from './value-zipper';
import { ArrayValue, ClassInstantiation, DistPtr, StaticMethodCall, StructLiteral, Value } from './values';

export interface GeneratorOptions {
  /**
   * Custom distributions
   */
  readonly customDistributions?: Record<string, ICustomDistribution>;
}

export class ValueGenerator {
  protected readonly query: DistributionOps;
  protected readonly customDistributions: Map<string, ICustomDistribution>;
  private readonly recursionBreaker = new Set<string>();

  constructor(model: ValueModel, protected readonly random: Random, options: GeneratorOptions = {}) {
    this.query = new DistributionOps(model);
    this.customDistributions = new Map(Object.entries(options.customDistributions ?? {}));
  }

  public minimal(fqn: string): Value {
    return unwrap(this.minimalValue(this.query.recordDistribution([{ type: 'fqn', fqn }]), []));
  }

  protected minimalValue(dist: DistributionRef, loc: Zipper): Result<Value> {
    return apply(this.query.resolveDist(dist), sources => {
      for (let i = 0; i < sources.length; i++) {
        const distPtr: DistPtr = { distId: dist.distId, sourceIndex: i };

        const ret = this.minimalValueFromSource(sources[i], distPtr, loc);
        if (!isFailure(ret)) { return ret; }
      }

      return failure('no options left to try');
    });
  }

  protected minimalValueFromSource(source: ResolvedValueSource, distPtr: DistPtr, loc: Zipper): Result<Value> {
    const distPtrKey = stringFromDistPtr(distPtr);

    if (this.recursionBreaker.has(stringFromDistPtr(distPtr))) {
      return failure('Breaking recursion');
    }

    this.recursionBreaker.add(distPtrKey);
    try {
      return apply(this._minimalValueFromSource(source, distPtr, loc), validateValue);
    } finally {
      this.recursionBreaker.delete(distPtrKey);
    }
  }

  private _minimalValueFromSource(source: ResolvedValueSource, distPtr: DistPtr, loc: Zipper): Result<Value> {
    switch (source.type) {
      case 'class-instantiation': {
        return this.fillMinimalArguments(source.parameters, loc, {
          type: 'class-instantiation',
          fqn: source.fqn,
          distPtr,
          parameterNames: source.parameters.map(p => p.name),
          arguments: [],
        });
      }
      case 'static-method-call': {
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
        // A minimal array has one element in it (many arrays have to be non-empty)
        // If we can't generate an element, don't generate an array at all
        const arrayBase: ArrayValue = {
          type: 'array',
          distPtr,
          elements: [],
        };
        const element = this.minimalValue(source.elements, zipperDescend(loc, arrayBase, 0));
        if (isFailure(element)) { return prependFailure('Could not generate array', element); }
        arrayBase.elements.push(element);
        return arrayBase;
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

  private fillMinimalArguments(ps: ParameterSource[], loc: Zipper, baseValue: ClassInstantiation | StaticMethodCall): Result<Value> {
    let i = 0;
    for (; i < ps.length; i++) {
      const p = ps[i];
      const arg = this.minimalValue(p.dist, zipperDescend(loc, baseValue, i));
      if (isFailure(arg)) { return arg; }
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

  private fillMinimalFields(fields: Record<string, DistributionRef>, loc: Zipper, baseStruct: StructLiteral): Result<Value> {
    for (const [k, ref] of Object.entries(fields)) {
      const value = this.minimalValue(ref, zipperDescend(loc, baseStruct, k));
      if (isFailure(value)) { return value; }

      baseStruct.entries[k] = value;
    }
    return baseStruct;
  }
}

export const ALPHABET_CHARS = '-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01923456789 _:$';

function stringFromDistPtr(x: DistPtr) {
  return `${x.distId}:${x.sourceIndex}`;
}

export function valueHasDistPtr(v: Value): v is Extract<Value, { distPtr: DistPtr }> {
  return v.type !== 'variable';
}

export function validateValue(v: Value): Value {
  if (valueHasDistPtr(v) && !v.distPtr) {
    throw new Error(`Value is missing distPtr: ${JSON.stringify(v)}`);
  }
  return v;
}