import { Value } from './values';

export interface ValueModel {
  /**
   * All distributions to draw values from.
   *
   * Class distributions will be identified with their FQN (because those are
   * mutable over the course of crawling the model), while value type distributions
   * are identified by their content hash.
   */
  readonly fqnSources: Record<string, FqnSource[]>;
  readonly distributions: Record<string, ValueDistribution>;
}

/**
 * Distribution where values are being drawn from
 */
export type FqnSource =
  // FQN distributions
  | ClassInstantiationSource
  | StaticMethodCallSource
  | ValueObjectSource
  | StaticPropertyAccessSource
  ;

export type ValueDistribution = ValueSource[];

export type ValueSource =
  | PrimitiveValueSource
  | NoValueSource
  | ArrayValueSource
  | MapValueSource
  | ConstantValueSource
  | IncludeFqnSources
  | CustomSource
  ;

export type ResolvedValueSource = FqnSource | Exclude<ValueSource, IncludeFqnSources>;
export type ResolvedValueDistribution = ResolvedValueSource[];


// Distribution is a pair of (name, [ValueSource, ...])
// Custom distributions: Scope, ConstructName, Arn, ...(etc)...
// Every distribution: drawMinimalValue(), mutateValue()
// Every mutation:
//    - Pick different distribution; OR
//    - Mutate value from distribution

// Distribution and reference to distribution are 2 differen things

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
  readonly dist: DistributionRef;
}

/**
 * Call a static method on a class
 */
export interface StaticMethodCallSource {
  readonly type: 'static-method-call';
  readonly fqn: string;
  readonly staticMethod: string;
  readonly parameters: ParameterSource[];
  readonly targetFqn: string;
}

/**
 * Access a static property on a class, or an enum value
 */
export interface StaticPropertyAccessSource {
  readonly type: 'static-property';
  readonly fqn: string;
  readonly staticProperty: string;
  readonly targetFqn: string;
}

/**
 * Construct a value object
 */
export interface ValueObjectSource {
  readonly type: 'value-object';
  readonly fqn: string;
  readonly fields: Record<string, DistributionRef>;
}

export interface DistributionRef {
  readonly distId: string;
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
  readonly elements: DistributionRef;
}

export interface MapValueSource {
  readonly type: 'map';
  readonly elements: DistributionRef;
}

export interface ConstantValueSource {
  readonly type: 'constant';
  readonly value: Value;
}

export interface IncludeFqnSources {
  readonly type: 'fqn';
  readonly fqn: string;
}

export interface CustomSource {
  readonly type: 'custom';
  readonly sourceName: string;
}
