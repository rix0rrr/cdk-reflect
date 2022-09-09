import { ValueSource } from './value-sources';

export function isSingleton<A>(xs: A[], pred: (x: A) => boolean) {
  return xs.length === 1 && pred(xs[0]);
}

export function isFqn(fqn: string) {
  return (x: ValueSource) => x.type === 'fqn' && x.fqn === fqn;
}

export function isString(x: ValueSource) {
  return x.type === 'primitive' && x.primitive === 'string';
}