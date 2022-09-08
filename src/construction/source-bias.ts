import { FqnValueSource, ValueSource } from './value-sources';

export interface ISourceBiaser {
  biasValue(sources: ValueSource[], context: BiaserContext): ValueSource[];
  biasFqnValue(sources: FqnValueSource[], context: BiaserContext): FqnValueSource[];
}

export type BiaserContext = ValueLoc[];

export type ValueLoc =
  | ArgumentLoc
  | StructFieldLoc
  | MapEntryLoc
  | ArrayElementLoc
  ;

interface ArgumentLoc {
  readonly type: 'argument';
  readonly argumentIndex: number;
  readonly argumentName: string;
  readonly callable: CallableContext;
}

export type CallableContext = ClassInstantiationContext | StaticMethodCallContext;

export interface ClassInstantiationContext {
  readonly type: 'class-instantiation';
  readonly fqn: string;
}

export interface StaticMethodCallContext {
  readonly type: 'static-method-call';
  readonly fqn: string;
  readonly staticMethod: string;
}

export interface StructFieldLoc {
  readonly type: 'struct-field';
  readonly fqn: string;
  readonly fieldName: string;
}

export interface MapEntryLoc {
  readonly type: 'map-entry';
  readonly key: string;
}


export interface ArrayElementLoc {
  readonly type: 'array-element';
  readonly index: number;
}
