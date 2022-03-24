import * as spec from '@jsii/spec';

export interface ConstructInfoModel {
  /**
   * All construct ({ fqn -> ConstructInfo })
   */
  readonly constructs: Record<string, ConstructInfo>;

  readonly enums: Record<string, EnumInfo>;

  readonly enumClasses: Record<string, EnumClassInfo>;

  readonly structs: Record<string, StructInfo>;

  /**
   * Integrations
   *
   * The key here is meaningless.
   */
  readonly integrations: Record<string, IntegrationInfo>;

  /**
   * Index integrations by source construct fqn
   */
  readonly integrationsBySource: Record<string, string[]>;

  /**
   * Index integratinos by target construct fqn
   */
  readonly integrationsByTarget: Record<string, string[]>;
}

export interface ConstructInfo extends Documentable {
  readonly fqn: string;
  readonly simpleName: string;
  readonly metrics?: MetricInfo[];

  /**
   * Construct properties
   *
   * This will be the possibles types for 3rd argument to the constructor
   * (typically only one type).
   */
  readonly constructPropertyTypes?: Extract<Type, { kind: 'struct' }>[];
}

export interface ParameterValue extends Documentable {
  readonly name: string;

  /**
   * All possible types expected here
   */
  readonly types: Type[];
  readonly optional?: boolean;
}

export interface MetricInfo extends Documentable {
  readonly displayName: string;
  readonly method: string;
}

export interface StructInfo extends Documentable {
  readonly fqn: string;
  readonly displayName: string;
  readonly properties: Record<string, ParameterValue>;
}

export interface Documentable {
  readonly summary?: string;
  readonly remarks?: string;
}

export type Type =
  | { readonly kind: 'primitive'; readonly primitiveType: spec.PrimitiveType }
  | { readonly kind: 'enum'; readonly enumFqn: string }
  | { readonly kind: 'enum-class'; readonly enumClassFqn: string }
  | { readonly kind: 'struct'; readonly structFqn: string }
  | { readonly kind: 'construct'; readonly constructFqn: string }
  | { readonly kind: 'array'; readonly elementTypes: Type[] }
  | { readonly kind: 'map'; readonly elementTypes: Type[] }
  ;

export interface EnumClassInfo extends Documentable {
  readonly fqn: string;
  readonly displayName: string;
  readonly factories: EnumClassFactory[];
}

export interface EnumClassFactory extends Documentable {
  readonly displayName: string;
  readonly methodName: string;
  readonly parameters: ParameterValue[];
}

export interface EnumInfo extends Documentable {
  readonly fqn: string;
  readonly displayName: string;
  readonly members: EnumMemberInfo[];
}

export interface EnumMemberInfo extends Documentable {
  readonly memberName: string;
  readonly displayName: string;
}

export interface IntegrationInfo extends Documentable {
  readonly sourceConstructFqn: string;
  readonly targetConstructFqn: string;
  readonly integrationFqn: string;
  readonly integrationName: string;

  /**
   * Method to call to add the integration
   */
  readonly methodName: string;

  /**
   * Whether the integration adding method takes a string as its first argument
   *
   * @default false
   */
  readonly methodTakesId?: boolean;

  /**
   * Integration options types
   *
   * This will be the possibles types for the 2nd argument to the construct
   * (typically only one type).
   */
  readonly integrationOptionsTypes: Extract<Type, { kind: 'struct' }>[];
}