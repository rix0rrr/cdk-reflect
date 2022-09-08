import { DeclarativeConstructInfoModel } from './declarative-construct-model';

export class DeclarativeConstructInfoReader {
  constructor(private readonly model: DeclarativeConstructInfoModel) {
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