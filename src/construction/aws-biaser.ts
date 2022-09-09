import { ArgumentLoc, BiaserContext, ISourceBiaser, StructFieldLoc } from './source-bias';
import { isSingleton, isString } from './value-source-predicates';
import { ValueSource, FqnValueSource } from './value-sources';

/**
 * A biaser that will try to do well for AWS CDK queries
 *
 * FIXME: weighting
 */
export class AwsBiaser implements ISourceBiaser {
  public biasValue(sources: ValueSource[], context: BiaserContext): ValueSource[] {
    if (isSingleton(sources, isString) && argumentName(context)?.includes('Arn')) {
      return [constantString('arn:aws:service:region:account-id:resource-type/resource-id')];
    }


    return sources;
  }

  public biasFqnValue(sources: FqnValueSource[], context: BiaserContext): FqnValueSource[] {
    void(context);
    return sources;
  }
}

function argumentName(context: BiaserContext): string | undefined {
  return context
    .filter((x): x is ArgumentLoc | StructFieldLoc => x.type === 'argument' || x.type === 'struct-field')
    .map(x => x.type === 'argument' ? x.argumentName : x.fieldName)
    [0];
}

function constantString(value: string): ValueSource {
  return { type: 'constant', value: { type: 'primitive', primitive: 'string', value } };
}