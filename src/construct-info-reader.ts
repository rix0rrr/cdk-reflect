import { ConstructInfoModel } from './info-model';

export class ConstructInfoReader {
  constructor(private readonly model: ConstructInfoModel) {
  }

  public integrationsBySource(fqn: string) {
    const keys = this.model.integrationsBySource[fqn] ?? [];
    return keys.map(k => this.model.integrations[k]);
  }

  public integrationsByTarget(fqn: string) {
    const keys = this.model.integrationsByTarget[fqn] ?? [];
    return keys.map(k => this.model.integrations[k]);
  }
}