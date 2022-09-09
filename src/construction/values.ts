/**
 * Mostly a copy of 'value-sources', but for specific values instead of types
 */

import { indent } from '../util';
import { PrimitiveName } from './value-sources';

export type Value =
  | ClassInstantiation
  | StaticMethodCall
  | ObjectLiteral
  | StaticPropertyAccess
  | PrimitiveValue
  | ArrayValue
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
}

/**
 * Construct a value object
 */
export interface ObjectLiteral {
  readonly type: 'object-literal';
  readonly fields: Record<string, Value>;
}

export type PrimitiveValue =
  | MkPrimitiveValue<'string', string>
  | MkPrimitiveValue<'number', number>
  | MkPrimitiveValue<'boolean', boolean>
  | MkPrimitiveValue<'json', any>
  | MkPrimitiveValue<'any', any>
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
        return '{\n' + Object.entries(x.fields)
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
