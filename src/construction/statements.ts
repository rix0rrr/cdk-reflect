import { classNameFromFqn, lcfirst, mapValues } from '../util';
import { printValue, Value } from './values';

export type Statement =
  | Assignment
  | Expression
  ;

export interface Assignment {
  readonly type: 'assignment';
  readonly variableName: string;
  readonly value: Value;
}

export interface Expression {
  readonly type: 'expression';
  readonly value: Value;
}

/**
 * Discretize the initialization of a value into statements
 */
export function discretize(value: Value): Statement[] {
  const statements = new Array<Statement>();
  const varCtr = new Map<string, number>();
  let nestingLevel = 0;

  const v = recurse(value);
  return [
    ...statements,
    { type: 'expression', value: v },
  ];

  function recurse(x: Value): Value {
    switch (x.type) {
      case 'object-literal':
      case 'map-literal':
        return withNesting(() => ({
          ...x,
          entries: mapValues(x.entries, recurse),
        }));

      case 'class-instantiation':
      case 'static-method-call':
        // FIXME: For static method calls this gives the wrong name
        const namingHint = x.fqn;
        return maybeExtract({
          ...x,
          arguments: x.arguments.map(a => ({ name: a.name, value: recurse(a.value) })),
        }, namingHint);

      case 'array':
        return {
          type: 'array',
          elements: x.elements.map(recurse),
        };

      case 'no-value':
      case 'primitive':
      case 'scope':
      case 'static-property':
      case 'variable':
        return x;
    }
  }

  /**
   * Maybe extract the given value to a variable
   *
   * Only extract if extracting is turned on and we are in a nested context, and this value
   * is obtained from a method call or object instantiation.
   *
   * Return the value or the variable.
   */
  function maybeExtract(x: Value, namingHint: string): Value {
    // Not enabled
    if (nestingLevel === 0) { return x; }

    // Not necessary
    if (x.type !== 'class-instantiation' && x.type !== 'static-method-call') { return x; }

    const variableName = makeVariableName(namingHint);
    statements.push({ type: 'assignment', variableName, value: x });
    return { type: 'variable', variableName };
  }

  function makeVariableName(fqn: string) {
    const variableName = lcfirst(classNameFromFqn(fqn));
    const i = (varCtr.get(variableName) ?? 0) + 1;
    varCtr.set(variableName, i);
    return `${variableName}${i > 1 ? i : ''}`;
  }

  function withNesting<A>(x: () => A): A {
    nestingLevel += 1;
    try {
      return x();
    } finally {
      nestingLevel -= 1;
    }
  }
}

export function printStatement(stmt: Statement): string {
  switch (stmt.type) {
    case 'expression':
      return printValue(stmt.value);
    case 'assignment':
      return `const ${stmt.variableName} = ${printValue(stmt.value)};`;
  }
}