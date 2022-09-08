import { BiaserContext, ISourceBiaser } from './source-bias';
import { ValueSource, FqnValueSource } from './value-sources';

/**
 * A biaser that will try to do well for AWS CDK queries
 */
export class AwsBiaser implements ISourceBiaser {
  public biasValue(sources: ValueSource[], context: BiaserContext): ValueSource[] {
    return sources;
  }

  public biasFqnValue(sources: FqnValueSource[], context: BiaserContext): FqnValueSource[] {
    void(context);
    return sources;
  }
}