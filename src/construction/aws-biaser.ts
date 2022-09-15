import { classNameFromFqn } from '../util';
import { ISourceBiaser } from './biasing';
import { ICustomDistribution } from './custom-distribution';
import { DistributionOps } from './distribution-ops';
import { ParameterSource, FqnSource, ValueModel, DistributionRef } from './distributions';
import { isSingleton, isString, stringPrim } from './value-helpers';
import { Zipper } from './value-zipper';
import { DistPtr, isCallableValue } from './values';

/**
 * A biaser that will try to do well for AWS CDK queries
 *
 * FIXME: weighting
 */
export class AwsBiaser implements ISourceBiaser {
  public biasFqnSource(source: FqnSource, model: ValueModel): FqnSource {
    const ops = new DistributionOps(model);

    switch (source.type) {
      case 'class-instantiation':
      case 'static-method-call':
        // Given opportunity to bias all params
        const parameters = source.parameters;

        source = {
          ...source,
          parameters: parameters.map((p, i) => this.biasParameter(p, i, ops, parameters)),
        };
        break;
      case 'value-object':
        source = {
          ...source,
          fields: Object.fromEntries(Object.entries(source.fields)
            .map(([k, v]) => [k, this.biasValue(k, v, ops)])),
        };
        break;
    }

    return source;
  }

  private biasParameter(p: ParameterSource, i: number, ops: DistributionOps, ps: ParameterSource[]): ParameterSource {
    if (isScopeParameter(p, ops)) {
      return {
        name: p.name,
        dist: ops.recordDistribution([{ type: 'custom', sourceName: 'scope' }]),
      };
    }

    if (i == 1 && isStringParameter(p, ops) && isScopeParameter(ps[0], ops)) {
      // If this a string that goes with a scope
      return {
        name: p.name,
        dist: ops.recordDistribution([{ type: 'custom', sourceName: 'constructId' }]),
      };
    }

    return {
      name: p.name,
      dist: this.biasValue(p.name, p.dist, ops),
    };
  }

  private biasValue(valueName: string, ref: DistributionRef, ops: DistributionOps): DistributionRef {
    const dist = ops.lookupDist(ref);

    if (isSingleton(dist, isString) && valueName.toLowerCase().includes('arn')) {
      return ops.recordDistribution([{ type: 'custom', sourceName: 'arn' }]);
    }

    return ref;
  }
}

function isScopeParameter(param: ParameterSource, ops: DistributionOps) {
  return param.name === 'scope' && ops.distIncludesFqn(param.dist, 'constructs.Construct');
}

function isStringParameter(param: ParameterSource, ops: DistributionOps) {
  return isSingleton(ops.lookupDist(param.dist), isString);
}

export const AWS_CUSTOM_DISTRIBUTIONS: Record<string, ICustomDistribution> = {
  scope: {
    minimalValue(distPtr) {
      return { type: 'scope', distPtr };
    },
    mutate() {
    },
  },
  constructId: new class implements ICustomDistribution {
    private readonly constructCounter = new Map<string, number>();

    public minimalValue(distPtr: DistPtr, zipper: Zipper) {
      const id = isCallableValue(zipper[0].ptr) ? `My${classNameFromFqn(zipper[0].ptr.fqn)}` : 'MyConstruct';
      const ctr = this.constructCounter.get(id);
      this.constructCounter.set(id, (ctr ?? 1) + 1);

      return stringPrim(`${id}${ctr ?? ''}`, distPtr);
    }

    public mutate() {
    }
  }(),
  arn: {
    minimalValue(distPtr) {
      return stringPrim('arn:aws:service:region:account-id:resource-type/resource-id', distPtr);
    },
    mutate() {
    },
  },
};