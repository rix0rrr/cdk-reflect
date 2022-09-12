import { FqnValueSource, ParameterSource, ValueSource } from './value-sources';
import { ValueLoc } from './zipper';

export interface ISourceBiaser {
  biasArguments(fqn: string, parameters: ParameterSource[], context: BiaserContext): ParameterSource[];
  biasValue(sources: ValueSource[], context: BiaserContext): ValueSource[];
  biasFqnValue(sources: FqnValueSource[], context: BiaserContext): FqnValueSource[];
}

export type BiaserContext = ValueLoc[];
