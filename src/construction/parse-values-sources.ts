import * as reflect from 'jsii-reflect';
import { FqnValueSource, ParameterSource, ValueSource, ValueSources } from './value-sources';

export interface ParseValueSourcesOptions {
  readonly assemblyLocations: string[];
}

export interface ParseValueSourcesResult {
  readonly model: ValueSources;
}

export async function parseValueSources(options: ParseValueSourcesOptions): Promise<ParseValueSourcesResult> {
  const ts = new reflect.TypeSystem();

  // load all assemblies into typesystem
  for (const assLoc of options.assemblyLocations) {
    await ts.load(assLoc, { validate: false });
  }

  const parser = new TypeSystemParser(ts);
  parser.parse();

  return {
    model: parser.model,
  };
}

class TypeSystemParser {
  public readonly model: ValueSources;

  constructor(private readonly ts: reflect.TypeSystem) {
    this.model = {
      types: {},
    };
  }

  public parse() {
    // Detect all types
    for (const enm of this.ts.enums) {
      this.visitEnum(enm);
    }

    for (const klass of this.ts.classes) {
      this.visitClass(klass);
    }

    for (const iface of this.ts.interfaces.filter(isStruct)) {
      this.visitStruct(iface);
    }
  }

  private visitClass(klass: reflect.ClassType) {
    // Can this class be instantiated via constructor?
    if (!klass.abstract && klass.initializer && !klass.initializer.protected) {
      this.addSource(klass, {
        type: 'class-instantiation',
        fqn: klass.fqn,
        parameters: this.deriveParameters(klass.initializer.parameters),
      });
    }

    // Visit all static methods, if they return an FQN type then add them
    // as constructors for those types
    for (const staticMethod of klass.ownMethods.filter(m => m.static)) {
      if (staticMethod.returns.type.type) {
        this.addSource(staticMethod.returns.type.type, {
          type: 'static-method-call',
          fqn: klass.fqn,
          staticMethod: staticMethod.name,
          parameters: this.deriveParameters(staticMethod.parameters),
        });
      }
    }

    // Same for props
    for (const staticProp of klass.ownProperties.filter(m => m.static)) {
      if (staticProp.type.type) {
        this.addSource(staticProp.type.type, {
          type: 'static-property',
          fqn: klass.fqn,
          staticProperty: staticProp.name,
        });
      }
    }
  }

  /**
   * An enum is always an enum
   */
  private visitEnum(enm: reflect.EnumType) {
    for (const mem of enm.members) {
      this.addSource(enm, {
        type: 'static-property',
        fqn: enm.fqn,
        staticProperty: mem.name,
      });
    }
  }

  private visitStruct(struct: reflect.InterfaceType) {
    this.addSource(struct, {
      type: 'value-object',
      fqn: struct.fqn,
      fields: Object.fromEntries(struct.allProperties.map(p =>
        [p.name, this.deriveValue(p.type, p.optional)])),
    });
  }

  private deriveParameters(parameters: reflect.Parameter[]): ParameterSource[] {
    // FIXME: Variadic parameters
    return parameters.map(p => ({
      name: p.name,
      value: this.deriveValue(p.type, p.optional),
    }));
  }

  private deriveValue(type: reflect.TypeReference, optional: boolean): ValueSource[] {
    const ret: ValueSource[] = [];
    if (optional) {
      ret.push({ type: 'no-value' });
    }

    if (type.arrayOfType) {
      ret.push({
        type: 'array',
        elements: this.deriveValue(type.arrayOfType, false),
      });
    }

    if (type.mapOfType) {
      ret.push({
        type: 'map',
        elements: this.deriveValue(type.mapOfType, false),
      });
    }

    if (type.unionOfTypes) {
      ret.push(...type.unionOfTypes.flatMap(t => this.deriveValue(t, false)));
    }

    if (type.fqn) {
      ret.push({
        type: 'fqn',
        fqn: type.fqn,
      });
    }

    if (type.primitive) {
      ret.push({
        type: 'primitive',
        primitive: type.primitive as any, // Force this
      });
    }

    return ret;
  }

  private addSource(type: reflect.Type, source: FqnValueSource) {
    const fqns: string[] = [type.fqn];

    if (type.isClassType()) {
      // If we are able to instantiate this class, it will count for the current
      // type and all of its supertypes and interfaces
      fqns.push(...type.getAncestors().map(a => a.fqn));
      fqns.push(...type.getInterfaces(true).map(i => i.fqn));
    } else if (type.isInterfaceType()) {
      fqns.push(...type.getInterfaces(true).map(i => i.fqn));
    }

    for (const fqn of fqns) {
      if (!this.model.types[fqn]) {
        this.model.types[fqn] = [];
      }
      this.model.types[fqn].push(source);
    }
  }

}

export interface Diagnostic {
  readonly fqn: string;
  readonly message: string;
}

function isStruct(type: reflect.Type): type is reflect.InterfaceType {
  return type.isDataType();
}
