import * as reflect from 'jsii-reflect';
import { ISourceBiaser } from './biasing';
import { DistributionOps } from './distribution-ops';
import { ParameterSource, ValueSource, ValueModel, ValueDistribution, FqnSource, DistributionRef } from './distributions';

export interface DistributionExtractorOptions {
  readonly assemblyLocations: string[];

  readonly biaser?: ISourceBiaser;
}

export interface DistrubtionExtractorResult {
  readonly model: ValueModel;
}

export async function parseValueSources(options: DistributionExtractorOptions): Promise<DistrubtionExtractorResult> {
  const ts = new reflect.TypeSystem();

  // load all assemblies into typesystem
  for (const assLoc of options.assemblyLocations) {
    await ts.load(assLoc, { validate: false });
  }

  const parser = new DistributionExtractor(ts, options);
  parser.parse();

  return {
    model: parser.model,
  };
}

class DistributionExtractor {
  public readonly model: ValueModel;
  private readonly ops: DistributionOps;

  constructor(private readonly ts: reflect.TypeSystem, private readonly options: DistributionExtractorOptions) {
    this.model = {
      fqnSources: {},
      distributions: {},
    };
    this.ops = new DistributionOps(this.model);
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
      this.addFqnSource(klass, {
        type: 'class-instantiation',
        fqn: klass.fqn,
        parameters: this.deriveParameters(klass.initializer.parameters),
      });
    }

    // Visit all static methods, if they return an FQN type then add them
    // as constructors for those types
    for (const staticMethod of klass.ownMethods.filter(m => m.static)) {
      if (staticMethod.returns.type.type) {
        this.addFqnSource(staticMethod.returns.type.type, {
          type: 'static-method-call',
          fqn: klass.fqn,
          staticMethod: staticMethod.name,
          parameters: this.deriveParameters(staticMethod.parameters),
          targetFqn: staticMethod.returns.type.fqn!,
        });
      }
    }

    // Same for props
    for (const staticProp of klass.ownProperties.filter(m => m.static)) {
      if (staticProp.type.type) {
        this.addFqnSource(staticProp.type.type, {
          type: 'static-property',
          fqn: klass.fqn,
          staticProperty: staticProp.name,
          targetFqn: staticProp.type.fqn!,
        });
      }
    }
  }

  /**
   * An enum is always an enum
   */
  private visitEnum(enm: reflect.EnumType) {
    for (const mem of enm.members) {
      this.addFqnSource(enm, {
        type: 'static-property',
        fqn: enm.fqn,
        staticProperty: mem.name,
        targetFqn: enm.fqn,
      });
    }
  }

  private visitStruct(struct: reflect.InterfaceType) {
    this.addFqnSource(struct, {
      type: 'value-object',
      fqn: struct.fqn,
      fields: Object.fromEntries(struct.allProperties.map(p =>
        [p.name, this.deriveDistRef(p.type, p.optional)])),
    });
  }

  private deriveParameters(parameters: reflect.Parameter[]): ParameterSource[] {
    // FIXME: Variadic parameters
    return parameters.map(p => ({
      name: p.name,
      dist: this.deriveDistRef(p.type, p.optional),
    }));
  }

  private deriveDistRef(type: reflect.TypeReference, optional: boolean): DistributionRef {
    return this.ops.recordDistribution(this.deriveDistribution(type, optional));
  }

  private deriveDistribution(type: reflect.TypeReference, optional: boolean): ValueDistribution {
    const dist: ValueSource[] = [];
    if (optional) {
      dist.push({ type: 'no-value' });
    }

    if (type.arrayOfType) {
      dist.push({
        type: 'array',
        elements: this.deriveDistRef(type.arrayOfType, false),
      });
    }

    if (type.mapOfType) {
      dist.push({
        type: 'map',
        elements: this.deriveDistRef(type.mapOfType, false),
      });
    }

    if (type.unionOfTypes) {
      dist.push(...type.unionOfTypes.flatMap(t => this.deriveDistribution(t, false)));
    }

    if (type.fqn) {
      dist.push({
        type: 'fqn',
        fqn: type.fqn,
      });
    }

    if (type.primitive) {
      dist.push({
        type: 'primitive',
        primitive: type.primitive as any, // Force this
      });
    }

    return dist;
  }

  private addFqnSource(type: reflect.Type, source: FqnSource) {
    const fqns: string[] = [type.fqn];

    source = this.options.biaser?.biasFqnSource(source, this.model) ?? source;

    if (type.isClassType()) {
      // If we are able to instantiate this class, it will count for the current
      // type and all of its supertypes and interfaces
      fqns.push(...type.getAncestors().map(a => a.fqn));
      fqns.push(...type.getInterfaces(true).map(i => i.fqn));
    } else if (type.isInterfaceType()) {
      fqns.push(...type.getInterfaces(true).map(i => i.fqn));
    }

    for (const fqn of fqns) {
      if (!this.model.fqnSources[fqn]) {
        this.model.fqnSources[fqn] = [];
      }
      this.model.fqnSources[fqn].push(source);
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
