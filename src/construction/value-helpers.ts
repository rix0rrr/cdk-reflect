import { ValueSource } from './distributions';
import { DistPtr, PrimitiveValue } from './values';

export function isSingleton<A>(xs: A[], pred: (x: A) => boolean) {
  return xs.length === 1 && pred(xs[0]);
}

export function isString(x: ValueSource) {
  return x.type === 'primitive' && x.primitive === 'string';
}

export function stringPrim(value: string, distPtr: DistPtr): PrimitiveValue {
  return { type: 'primitive', distPtr, primitive: 'string', value };
}