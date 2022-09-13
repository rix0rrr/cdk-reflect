import { CustomSource } from './distributions';
import { Zipper } from './value-zipper';
import { DistPtr, Value } from './values';

export interface IValueMutator {
  proposeSet(zipper: Zipper, value: Value): void;
  proposeDelete(zipper: Zipper): void;
}

export interface ICustomDistribution {
  minimalValue(distPtr: DistPtr, zipper: Zipper, source: CustomSource): Value;
  mutate(value: Value, zipper: Zipper, mutator: IValueMutator): void;
}