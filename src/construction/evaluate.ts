import { App, Stack } from 'aws-cdk-lib';
import * as fs from 'fs-extra';
import { assertSwitchIsExhaustive } from '../util';
import { printStatement, Statement } from './statements';
import { Value } from './values';

export interface EvaluatorOptions {
  /**
   * Print statements as they're being evaluated
   *
   * @default false
   */
  readonly printStatements?: boolean;
}

export class Evaluator {
  private readonly app = new App();
  private readonly stack = new Stack(this.app, 'Stack');
  private readonly variables = new Map<string, any>();
  public readonly statements = new Array<string>();

  constructor(private readonly options: EvaluatorOptions = {}) {
  }

  public async synth(plan: Statement[]): Promise<any> {
    for (const stmt of plan) {
      if (this.options.printStatements) {
        console.log(printStatement(stmt));
      }
      this.evaluateStatement(stmt);
    }

    const asm = this.app.synth();
    const artifact = asm.getStackByName(this.stack.stackName);
    const template = artifact.template;

    await fs.rm(asm.directory, { recursive: true });

    return template;
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
        return undefined;
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
        const args = plan.arguments.map(a => this.evaluate(a));
        return Reflect.construct(type, args);
      }
      case 'static-method-call': {
        const type = resolveType(plan.fqn);
        const fn = type[plan.staticMethod];
        assertCallable(type);
        const args = plan.arguments.map(a => this.evaluate(a));
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

const SYMBOL_CACHE = new Map<string, any>();

function resolveType(fqn: string): any {
  const existing = SYMBOL_CACHE.get(fqn);
  if (existing) { return existing; }

  let ret;
  const rightMostPeriod = fqn.lastIndexOf('.');
  if (rightMostPeriod === -1) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ret = require(fqn);
  } else {
    const parentFqn = fqn.substring(0, rightMostPeriod);
    const attr = fqn.substring(rightMostPeriod + 1);

    ret = resolveType(parentFqn)[attr];
  }

  SYMBOL_CACHE.set(fqn, ret);
  return ret;
}

function assertCallable(x: unknown): asserts x is (...xs: any[]) => any {
  if (typeof x !== 'function') {
    throw new Error(`Expected a callable, got ${x}`);
  }
}