import { Value } from './values';

export interface ValueSources {
  readonly types: Record<string, FqnValueSource[]>;
}

export type FqnValueSource =
  | ClassInstantiationSource
  | StaticMethodCallSource
  | ValueObjectSource
  | StaticPropertyAccessSource
  | ConstantValueSource
  ;

/**
 * Instantiate a class via its constructor
 */
export interface ClassInstantiationSource {
  readonly type: 'class-instantiation';
  readonly fqn: string;
  readonly parameters: ParameterSource[];
};

export interface ParameterSource {
  readonly name: string;
  readonly value: ValueSource[];
}

/**
 * Call a static method on a class
 */
export interface StaticMethodCallSource {
  readonly type: 'static-method-call';
  readonly fqn: string;
  readonly staticMethod: string;
  readonly parameters: ParameterSource[];
}

/**
 * Access a static property on a class, or an enum value
 */
export interface StaticPropertyAccessSource {
  readonly type: 'static-property';
  readonly fqn: string;
  readonly staticProperty: string;
}

/**
 * Construct a value object
 */
export interface ValueObjectSource {
  readonly type: 'value-object';
  readonly fqn: string;
  readonly fields: Record<string, ValueSource[]>;
}

export type ValueSource =
  | FqnReferenceSource
  | PrimitiveValueSource
  | NoValueSource
  | ArrayValueSource
  | MapValueSource
  | ConstantValueSource
  ;

export interface FqnReferenceSource {
  readonly type: 'fqn';
  readonly fqn: string;
}

export interface NoValueSource {
  readonly type: 'no-value';
}

export interface PrimitiveValueSource {
  readonly type: 'primitive';
  readonly primitive: PrimitiveName;
}

export type PrimitiveName = 'string' | 'number' | 'boolean' | 'json' | 'date' | 'any';

export interface ArrayValueSource {
  readonly type: 'array';
  readonly elements: ValueSource[];
}

export interface MapValueSource {
  readonly type: 'map';
  readonly elements: ValueSource[];
}

export interface ConstantValueSource {
  readonly type: 'constant';
  readonly value: Value;
}