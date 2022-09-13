import { FqnSource, ValueModel } from './distributions';

export interface ISourceBiaser {
  biasFqnSource(source: FqnSource, model: ValueModel): FqnSource;
}