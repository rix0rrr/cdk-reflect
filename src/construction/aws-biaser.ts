import { classNameFromFqn } from '../util';
import { BiaserContext, ISourceBiaser } from './biasing';
import { isFqn, isSingleton, isString } from './value-source-predicates';
import { ValueSource, ParameterSource } from './value-sources';
import { Value } from './values';
import { ClassInstantiationLoc, StaticMethodCallLoc, StructFieldLoc } from './zipper';

/**
 * A biaser that will try to do well for AWS CDK queries
 *
 * FIXME: weighting
 */
export class AwsBiaser implements ISourceBiaser {
  public biasArguments(fqn: string, parameters: ParameterSource[]): ParameterSource[] {
    if (this.isConstructParameters(parameters)) {
      return [
        { name: parameters[0].name, value: [constant({ type: 'scope' })] },
        { name: parameters[1].name, value: [constant(stringPrim(`My${classNameFromFqn(fqn)}`))] },
        ...parameters.slice(2),
      ];
    }

    return parameters;
  }

  public biasValue(sources: ValueSource[], context: BiaserContext): ValueSource[] {
    if (isSingleton(sources, isString) && argumentName(context)?.includes('Arn')) {
      return [constant(stringPrim('arn:aws:service:region:account-id:resource-type/resource-id'))];
    }


    return sources;
  }

  private isConstructParameters(ps: ParameterSource[]) {
    return (ps.length >= 2
      && ps[0].name === 'scope' && isSingleton(ps[0].value, isFqn('constructs.Construct'))
      && isSingleton(ps[1].value, isString));
  }
}

function argumentName(context: BiaserContext): string | undefined {
  const record = context
    .filter((x): x is ClassInstantiationLoc | StaticMethodCallLoc | StructFieldLoc => x.type === 'class-instantiation' || x.type === 'static-method-call' || x.type === 'struct-field')
    [0];

  if (!record) { return undefined; }
  switch (record.type) {
    case 'class-instantiation':
    case 'static-method-call':
      const index = record.argumentIndex;
      return record.ptr.arguments[index].name;

    case 'struct-field':
      return record.fieldName;
  }
}

function constant(value: Value): ValueSource {
  return { type: 'constant', value };
}

function stringPrim(value: string): Value {
  return { type: 'primitive', primitive: 'string', value };
}