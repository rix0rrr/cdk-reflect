import { CustomSource } from './distributions';
import { Zipper } from './value-zipper';
import { DistPtr, Value } from './values';

export interface ICustomDistribution {
  minimalValue(distPtr: DistPtr, zipper: Zipper, source: CustomSource): Value;
}