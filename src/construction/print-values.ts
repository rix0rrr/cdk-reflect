import { Statement } from './plan';
import { Value } from './values';

export function printStatement(stmt: Statement): string {
  switch (stmt.type) {
    case 'expression':
      return printValue(stmt.value);
    case 'assignment':
      return `const ${stmt.variableName} = ${printValue(stmt.value)};`;
  }
}

export function printValue(value: Value): string {
  return recurse(value);

  function recurse(x: Value): string {
    switch (x.type) {
      case 'variable':
        return x.variableName;
      case 'static-property':
        return `${x.fqn}.${x.staticProperty}`;
      case 'no-value':
        return '<no-value>';
      case 'scope':
        return '<scope>';
      case 'primitive':
        return JSON.stringify(x.value);
      case 'array':
        const els = x.elements.map(recurse);
        const multiline = els.some(e => e.indexOf('\n') > -1);

        return multiline
          ? '[\n' + els.map(e => indent(e)).join(',\n') + '\n]'
          : '[' + els.join(', ') + ']';
      case 'object-literal':
        return '{\n' + Object.entries(x.fields)
          .map(([k, v]) => indent(`${k}: ${recurse(v)}`))
          .join(',\n')
          + '\n}';
      case 'class-instantiation':
        return `new ${x.fqn}(${x.arguments.map(a => recurse(a.value)).join(', ')})`;
      case 'static-method-call':
        return `${x.fqn}.${x.staticMethod}(${x.arguments.map(a => recurse(a.value)).join(', ')})`;
    }
  }
}

export function indent(x: string, ind: string = '  '): string {
  return ind + x.replace(/\n/g, `\n${ind}`);
}