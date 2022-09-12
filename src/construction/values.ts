/**
 * Mostly a copy of 'value-sources', but for specific values instead of types
 */

import { indent } from '../util';
import { PrimitiveName, ValueSource } from './value-sources';

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

/**
 * Instantiate a class via its constructor
 */
export interface ClassInstantiation {
  readonly type: 'class-instantiation';
  readonly fqn: string;
  readonly arguments: Argument[];
};

/**
 * Call a static method on a class
 */
export interface StaticMethodCall {
  readonly type: 'static-method-call';
  readonly fqn: string;
  readonly staticMethod: string;
  readonly arguments: Argument[];
  readonly targetFqn: string;
}

export interface Argument {
  readonly name: string;
  readonly value: Value;
}

/**
 * Access a static property on a class, or an enum value
 */
export interface StaticPropertyAccess {
  readonly type: 'static-property';
  readonly fqn: string;
  readonly staticProperty: string;
  readonly targetFqn: string;
}

/**
 * Construct a value object
 */
export interface StructLiteral {
  readonly type: 'object-literal';
  readonly fqn: string;
  readonly entries: Record<string, Value>;
}

export interface MapLiteral {
  readonly type: 'map-literal';
  readonly entries: Record<string, Value>;
}

export type PrimitiveValue =
  | MkPrimitiveValue<'string', string>
  | MkPrimitiveValue<'number', number>
  | MkPrimitiveValue<'boolean', boolean>
  | MkPrimitiveValue<'date', Date>
  ;

export interface MkPrimitiveValue<N extends PrimitiveName, A> {
  readonly type: 'primitive';
  readonly primitive: N;
  readonly value: A;
}

export interface ArrayValue {
  readonly type: 'array';
  readonly elements: Value[];
}

export interface NoValue {
  readonly type: 'no-value';
}

export interface Variable {
  readonly type: 'variable';
  readonly variableName: string;
}

export interface ScopeValue {
  readonly type: 'scope';
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
          .map(([k, v]) => indent(`${k}: ${recurse(v)}`))
          .join(',\n')
          + '\n}';
      case 'class-instantiation':
        return `new ${x.fqn}(${x.arguments.map(a => recurse(a.value)).join(', ')})`;
      case 'static-method-call':
        return `${x.fqn}.${x.staticMethod}(${x.arguments.map(a => recurse(a.value)).join(', ')})`;
    }
  }
}

export function valueEquals(a: Value, b: Value): boolean {
  switch (a.type) {
    case 'array':
      if (b.type !== 'array') { return false; }
      return a.elements.length === b.elements.length && a.elements.every((x, i) => valueEquals(x, b.elements[i]));
    case 'class-instantiation':
      if (b.type !== 'class-instantiation') { return false; }
      // No need to recurse into arguments -- there is only one constructor for every class
      return a.fqn === b.fqn;
    case 'map-literal':
    case 'object-literal': {
      if (b.type !== a.type) { return false; }
      const aKeys = Object.keys(a.entries);
      const bKeys = Object.keys(b.entries);
      return aKeys.length === bKeys.length && aKeys.every(k => b.entries[k] && valueEquals(a.entries[k], b.entries[k]));
    }
    case 'no-value':
    case 'scope':
      return b.type === a.type;
    case 'variable':
      return b.type === 'variable' && a.variableName === b.variableName;
    case 'primitive':
      if (b.type !== 'primitive') { return false; }
      switch (a.primitive) {
        case 'boolean':
        case 'number':
        case 'string':
          return b.primitive === a.primitive && a.value === b.value;
        case 'date':
          return b.primitive === 'date' && a.value.getTime() === b.value.getTime();
      }
    case 'static-method-call':
      if (b.type !== 'static-method-call') { return false; }
      // No need to recurse into arguments -- there are no overloads
      return a.fqn === b.fqn && a.staticMethod === b.staticMethod;
    case 'static-property':
      return a.type === b.type && a.fqn === b.fqn && a.staticProperty === b.staticProperty;
  }
}

export function valueIsFromSource(value: Value, source: ValueSource): boolean {
  switch (source.type) {
    case 'constant':
      return valueEquals(value, source.value);
    case 'array':
      return value.type === 'array' && source.elements.some(e => valueIsFromSource(value, e));
    case 'class-instantiation':
      return value.type === 'class-instantiation' && value.fqn === source.fqn;
    case 'map':
      return value.type === 'map-literal' && Object.values(value.entries).every(el => source.elements.every(s => valueIsFromSource(el, s)));
    case 'no-value':
      return false;
    case 'primitive':
      return value.type === 'primitive' && value.primitive === source.primitive;
    case 'static-method-call':
      return value.type === 'static-method-call' && value.fqn === source.fqn && value.staticMethod === source.staticMethod;
    case 'static-property':
      return value.type === 'static-property' && value.fqn === source.fqn && value.staticProperty === source.staticProperty;
    case 'value-object':
      return value.type === 'object-literal' && value.fqn === source.fqn;
    case 'fqn':
      return ((value.type === 'class-instantiation' && value.fqn === source.fqn)
        || (value.type === 'static-method-call' && value.targetFqn === source.fqn)
        || (value.type === 'object-literal' && value.fqn === source.fqn)
        || (value.type === 'static-property' && value.targetFqn === source.fqn));
  }
}