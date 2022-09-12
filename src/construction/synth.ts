import { App, Stack } from 'aws-cdk-lib';
import { assertSwitchIsExhaustive } from '../util';
import { printStatement, Statement } from './statements';
import { Value } from './values';

export interface SynthesizerOptions {
  /**
   * Print statements as they're being evaluated
   *
   * @default false
   */
  readonly printStatements?: boolean;
}

export class Synthesizer {
  private readonly app = new App();
  private readonly stack = new Stack(this.app, 'Stack');
  private readonly variables = new Map<string, any>();
  public readonly statements = new Array<string>();

  constructor(private readonly options: SynthesizerOptions = {}) {
  }

  public synth(plan: Statement[]): any {
    for (const stmt of plan) {
      if (this.options.printStatements) {
        console.log(printStatement(stmt));
      }
      this.evaluateStatement(stmt);
    }

    const asm = this.app.synth();
    const artifact = asm.getStackByName(this.stack.stackName);
    return artifact.template;
  }

  private evaluateStatement(s: Statement): Value {
    switch (s.type) {
      case 'assignment':
        if (this.variables.has(s.variableName)) {
          throw new Error(`Variable name already used: ${s.variableName}`);
        }
        const value = this.evaluate(s.value);
        this.variables.set(s.variableName, value);
        return value;
      case 'expression':
        // Evaluate for side effect
        return this.evaluate(s.value);
      default:
        assertSwitchIsExhaustive(s);
    }
  }

  private evaluate(plan: Value): any {
    switch (plan.type) {
      case 'no-value':
        throw new Error('no-value cannot be evaluated');
      case 'primitive':
        return plan.value;
      case 'scope':
        return this.stack;
      case 'array':
        return plan.elements.map(e => this.evaluate(e));
      case 'object-literal':
      case 'map-literal':
        return Object.fromEntries(Object.entries(plan.entries)
          .map(([k, v]) => [k, this.evaluate(v)]));
      case 'class-instantiation': {
        const type = resolveType(plan.fqn);
        assertCallable(type);
        const args = plan.arguments.map(a => this.evaluate(a.value));
        return Reflect.construct(type, args);
      }
      case 'static-method-call': {
        const type = resolveType(plan.fqn);
        const fn = type[plan.staticMethod];
        assertCallable(type);
        const args = plan.arguments.map(a => this.evaluate(a.value));
        return Reflect.apply(fn, type, args);
      }
      case 'static-property': {
        const type = resolveType(plan.fqn);
        return type[plan.staticProperty];
      }
      case 'variable':
        if (!this.variables.has(plan.variableName)) {
          throw new Error(`Undefined variable: ${plan.variableName}`);
        }
        return this.variables.get(plan.variableName);
      default:
        assertSwitchIsExhaustive(plan);
    }
  }
}

function resolveType(fqn: string): any {
  const parts = fqn.split('.');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let ret = require(parts[0]);
  parts.shift();

  let name = parts.shift();
  while (name) {
    ret = ret[name];
    name = parts.shift();
  }

  return ret;
}

function assertCallable(x: unknown): asserts x is (...xs: any[]) => any {
  if (typeof x !== 'function') {
    throw new Error(`Expected a callable, got ${x}`);
  }
}