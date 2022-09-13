import * as crypto from 'crypto';
import { DistributionRef, FqnSource, ResolvedValueDistribution, ValueDistribution, ValueModel } from './distributions';

export class DistributionOps {
  constructor(public readonly model: ValueModel) {
  }

  public lookupDist(ref: DistributionRef) {
    return this.model.distributions[ref.distId] ?? [];
  }

  public lookupFqn(fqn: string): FqnSource[] {
    const constructors = this.model.fqnSources[fqn];
    if (!constructors || constructors.length === 0) {
      throw new Error(`No constructors for type: ${fqn}`);
    }
    return constructors;
  }

  /**
   * Look up a distribution with the FQNs substituted by their constructors
   */
  public resolveDist(ref: DistributionRef): ResolvedValueDistribution {
    const ret: ResolvedValueDistribution = [];

    for (const src of this.lookupDist(ref)) {
      if (src.type === 'fqn') {
        ret.push(...this.lookupFqn(src.fqn));
      } else {
        ret.push(src);
      }
    }

    if (ret.length === 0) {
      throw new Error(`No values in distribution: ${ref.distId}`);
    }

    return ret;
  }

  public distIncludesFqn(ref: DistributionRef, fqn: string) {
    return this.lookupDist(ref).some(x => x.type === 'fqn' && x.fqn === fqn);
  }

  public recordDistribution(dist: ValueDistribution): DistributionRef {
    const distId = this.hashValueDistribution(dist);
    if (this.model.distributions[distId]) {
      // Check that they're the same, I don't trust we don't have hash collissions
      if (JSON.stringify(this.model.distributions[distId]) !== JSON.stringify(dist)) {
        throw new Error(`Hash collission on ID: ${distId}. Increase the hash size.`);
      }
    } else {
      this.model.distributions[distId] = dist;
    }
    return { distId };
  }

  private hashValueDistribution(d: ValueDistribution): string {
    const h = crypto.createHash('sha256');
    h.update(JSON.stringify(d));
    return h.digest('hex').substring(0, HASH_LENGTH);
  }
}

const HASH_LENGTH = 12;
