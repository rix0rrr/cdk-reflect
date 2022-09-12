import { ArrayValue, ClassInstantiation, MapLiteral, StaticMethodCall, StructLiteral, Value } from './values';

export type Zipper = ValueLoc[];

export function zipperSet(z: Zipper, value: Value): Value {
  return zipperSetRec(z, [value])[0];
}

export function zipperDelete(z: Zipper): Value {
  if (z.length === 0) {
    throw new Error('Cannot delete in an empty zipper');
  }
  return zipperSetRec(z, [])[0];
}

export function zipperDescend(z: Zipper, v: ClassInstantiation | StaticMethodCall, argumentIndex: number): Zipper;
export function zipperDescend(z: Zipper, v: StructLiteral, fieldName: string): Zipper;
export function zipperDescend(z: Zipper, v: MapLiteral, key: string): Zipper;
export function zipperDescend(z: Zipper, v: ArrayValue, index: number): Zipper;
export function zipperDescend(z: Zipper, v: ZipperableValue, loc: any): Zipper {
  return [nextLevel(), ...z];
  function nextLevel(): ValueLoc {
    switch (v.type) {
      case 'class-instantiation':
        return {
          type: 'class-instantiation',
          argumentIndex: loc,
          ptr: v,
        } as ClassInstantiationLoc;
      case 'static-method-call':
        return {
          type: 'static-method-call',
          argumentIndex: loc,
          ptr: v,
        };
      case 'object-literal':
        return {
          type: 'struct-field',
          fieldName: loc,
          ptr: v,
        };
      case 'map-literal':
        return {
          type: 'map-entry',
          key: loc,
          ptr: v,
        };
      case 'array':
        return {
          type: 'array-element',
          index: loc,
          ptr: v,
        };
    }
  }
}

/**
 * Shared implementation for the zippers to save space
 *
 * Value should be an empty list or list of one element. This is just
 * convenient because we can use the same splat syntax for replacing
 * and deleting in a list.
 */
function zipperSetRec(z: Zipper, value: Value[]): Value[] {
  if (z.length === 0) { return value; }

  const x = z[z.length - 1];
  switch (x.type) {
    case 'class-instantiation':
      return [{
        type: 'class-instantiation',
        fqn: x.ptr.fqn,
        arguments: [
          ...x.ptr.arguments.slice(0, x.argumentIndex),
          ...next(),
          ...x.ptr.arguments.slice(x.argumentIndex + 1),
        ],
      } as ClassInstantiation];
    case 'static-method-call':
      return [{
        type: 'static-method-call',
        fqn: x.ptr.fqn,
        staticMethod: x.ptr.staticMethod,
        arguments: [
          ...x.ptr.arguments.slice(0, x.argumentIndex),
          ...next(),
          ...x.ptr.arguments.slice(x.argumentIndex + 1),
        ],
      } as StaticMethodCall];
    case 'array-element':
      return [{
        type: 'array',
        elements: [
          ...x.ptr.elements.slice(0, x.index),
          ...next(),
          ...x.ptr.elements.slice(x.index + 1),
        ],
      } as ArrayValue];
    case 'map-entry': {
      const nextV = next();
      return [{
        type: 'map-literal',
        entries: nextV.length > 0
          ? { ...x.ptr.entries, [x.key]: nextV[0] }
          : unset({ ...x.ptr.entries }, x.key),
      } as MapLiteral];
    }
    case 'struct-field': {
      const nextV = next();
      return [{
        type: 'object-literal',
        entries: nextV.length > 0
          ? { ...x.ptr.entries, [x.fieldName]: nextV[0] }
          : unset({ ...x.ptr.entries }, x.fieldName),
      } as StructLiteral];
    }
  }

  function next() {
    return zipperSetRec(z.slice(0, z.length - 1), value);
  }
}

function unset<A extends object>(x: A, k: keyof A): A {
  delete x[k];
  return x;
}

export type ValueLoc =
  | ClassInstantiationLoc
  | StaticMethodCallLoc
  | StructFieldLoc
  | MapEntryLoc
  | ArrayElementLoc
  ;

export type ZipperableValue = ValueLoc['ptr'];

export interface ClassInstantiationLoc {
  readonly type: 'class-instantiation';
  // FIXME: Variadic
  readonly argumentIndex: number;
  readonly ptr: ClassInstantiation;
}

export interface StaticMethodCallLoc {
  readonly type: 'static-method-call';
  // FIXME: Variadic
  readonly argumentIndex: number;
  readonly ptr: StaticMethodCall;
}

export interface StructFieldLoc {
  readonly type: 'struct-field';
  readonly fieldName: string;
  readonly ptr: StructLiteral;
}

export interface MapEntryLoc {
  readonly type: 'map-entry';
  readonly key: string;
  readonly ptr: MapLiteral;
}

export interface ArrayElementLoc {
  readonly type: 'array-element';
  readonly index: number;
  readonly ptr: ArrayValue;
}