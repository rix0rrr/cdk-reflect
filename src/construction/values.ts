/**
 * Mostly a copy of 'value-sources', but for specific values instead of types
 */

import { indent } from '../util';
import { PrimitiveName } from './distributions';

export type Value =
  // Compound values
  | ClassInstantiation
  | StaticMethodCall
  | StructLiteral
  | ArrayValue
  | MapLiteral
  // Scalar values
  | StaticPropertyAccess
  | PrimitiveValue
  | NoValue
  | ScopeValue
  | Variable
  ;

export interface DistPtr {
  /**
   * What distribution this value was drawn from
   */
  readonly distId: string;

  /**
   * If the distribution contains multiple sources, its index
   *
   * If the distributions contains an "fqn" source, the index will be pointing to the splatted
   * list with the fqn sources included.
   */
  readonly sourceIndex: number;
}

export interface ValueBase {
  readonly distPtr: DistPtr;
}


/**
 * Instantiate a class via its constructor
 */
export interface ClassInstantiation extends ValueBase {
  readonly type: 'class-instantiation';
  readonly fqn: string;
  readonly parameterNames: string[];
  readonly arguments: Value[];
};

/**
 * Call a static method on a class
 */
export interface StaticMethodCall extends ValueBase {
  readonly type: 'static-method-call';
  readonly fqn: string;
  readonly staticMethod: string;
  readonly targetFqn: string;
  readonly parameterNames: string[];
  readonly arguments: Value[];
}

/**
 * Access a static property on a class, or an enum value
 */
export interface StaticPropertyAccess extends ValueBase {
  readonly type: 'static-property';
  readonly fqn: string;
  readonly staticProperty: string;
  readonly targetFqn: string;
}

/**
 * Construct a value object
 */
export interface StructLiteral extends ValueBase {
  readonly type: 'object-literal';
  readonly fqn: string;
  readonly entries: Record<string, Value>;
}

export interface MapLiteral extends ValueBase {
  readonly type: 'map-literal';
  readonly entries: Record<string, Value>;
}

export type PrimitiveValue =
  | MkPrimitiveValue<'string', string>
  | MkPrimitiveValue<'number', number>
  | MkPrimitiveValue<'boolean', boolean>
  | MkPrimitiveValue<'date', Date>
  ;

export interface MkPrimitiveValue<N extends PrimitiveName, A> extends ValueBase {
  readonly type: 'primitive';
  readonly primitive: N;
  readonly value: A;
}

export interface ArrayValue extends ValueBase {
  readonly type: 'array';
  readonly elements: Value[];
}

export interface NoValue extends ValueBase {
  readonly type: 'no-value';
}

export interface Variable {
  readonly type: 'variable';
  readonly variableName: string;
}

export interface ScopeValue extends ValueBase {
  readonly type: 'scope';
}

export function isCallableValue(x: Value): x is ClassInstantiation | StaticMethodCall {
  return x.type === 'class-instantiation' || x.type === 'static-method-call';
}

export function printValue(value: Value): string {
  return recurse(value);

  function recurse(x: Value): string {
    switch (x.type) {
      case 'variable':
        return x.variableName;
      case 'static-property':
        return `${x.fqn}.${x.staticProperty}`;
      case 'no-value':
        return '<no-value>';
      case 'scope':
        return '<scope>';
      case 'primitive':
        return JSON.stringify(x.value);
      case 'array':
        const els = x.elements.map(recurse);
        const multiline = els.some(e => e.indexOf('\n') > -1);

        return multiline
          ? '[\n' + els.map(e => indent(e)).join(',\n') + '\n]'
          : '[' + els.join(', ') + ']';
      case 'object-literal':
      case 'map-literal':
        return '{\n' + Object.entries(x.entries)
          .filter(([_, v]) => v.type !== 'no-value')
          .map(([k, v]) => indent(`${k}: ${recurse(v)},\n`))
          + '}';
      case 'class-instantiation':
        return `new ${x.fqn}(${x.arguments.map(recurse).join(', ')})`;
      case 'static-method-call':
        return `${x.fqn}.${x.staticMethod}(${x.arguments.map(recurse).join(', ')})`;
    }
  }
}
