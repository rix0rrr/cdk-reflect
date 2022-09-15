import * as spec from '@jsii/spec';
import * as Case from 'case';
import * as reflect from 'jsii-reflect';
import { Failure, failure, isFailure, isSuccess, liftR, mkdict, partition, reasons, Result, unwrap } from '../util';
import { DeclarativeConstructInfoModel, EnumClassFactory, EnumClassSingleton, IntegrationInfo, MetricInfo, ParameterValue, Type } from './declarative-construct-model';

export interface ExtractConstructInfoOptions {
  readonly assemblyLocations: string[];
}

export interface ExtractConstructInfoResult {
  readonly constructInfo: DeclarativeConstructInfoModel;
  readonly diagnostics: Diagnostic[];
}

export async function extractConstructInfo(options: ExtractConstructInfoOptions): Promise<ExtractConstructInfoResult> {
  const ts = new reflect.TypeSystem();

  // load all assemblies into typesystem
  for (const assLoc of options.assemblyLocations) {
    await ts.load(assLoc, { validate: false });
  }

  const parser = new TypeSystemParser(ts);
  parser.parse();

  return {
    constructInfo: parser.constructInfo,
    diagnostics: parser.diagnostics,
  };
}

class TypeSystemParser {
  public readonly constructInfo: DeclarativeConstructInfoModel;
  public readonly diagnostics = new Array<Diagnostic>();
  private readonly constructBase?: reflect.Type;
  private readonly iConstructBase?: reflect.Type;

  private integrationCtr = 0;

  constructor(private readonly ts: reflect.TypeSystem) {
    this.constructInfo = {
      constructs: {},
      enumClasses: {},
      enums: {},
      integrations: {},
      structs: {},
      integrationsBySource: {},
      integrationsByTarget: {},
    };

    this.constructBase = ts.tryFindFqn('constructs.Construct');
    this.iConstructBase = ts.tryFindFqn('constructs.IConstruct');
  }

  public parse() {
    // Detect all types
    for (const enm of this.ts.enums) {
      this.tryEnum(enm);
    }

    for (const klass of this.ts.classes) {
      this.tryConstruct(klass);
      this.tryEnumClass(klass);
    }

    for (const iface of this.ts.interfaces.filter(isStruct)) {
      this.tryStruct(iface);
    }

    // Do this until it doesn't change anymore
    let change = this.removeNonconstructibleTypes();
    while (change) {
      change = this.removeNonconstructibleTypes();
    }
  }

  private isConstruct(t: reflect.Type) {
    return t.isClassType() && this.constructBase && t.extends(this.constructBase) && !t.abstract;
  }

  private isConstructInterface(t: reflect.Type) {
    return t.isInterfaceType() && this.iConstructBase && t.extends(this.iConstructBase);
  }

  /**
   * A class is a construct if it descends from the Construct base class
   */
  private tryConstruct(klass: reflect.ClassType) {
    if (!this.isConstruct(klass)) { return; }

    const thirdParameter = klass.initializer?.parameters?.[2];
    const propsTypes = thirdParameter ? this.convertTypeRef(thirdParameter.type) : [];

    // The accepted property types that are structs and we can instantiate
    const constructPropertyTypes = propsTypes.filter(isSuccess).map(unwrap).filter(isStructType);

    // If we found structs to begin
    if (propsTypes.length > 0 && constructPropertyTypes.length === 0) {
      this.emitDiagnostic({
        fqn: klass.fqn,
        message: `construct not instantiable: ${reasons(propsTypes)}`,
      });
      return;
    }

    this.constructInfo.constructs[klass.fqn] = {
      fqn: klass.fqn,
      simpleName: klass.name,
      metrics: this.extractMetrics(klass),
      constructPropertyTypes,
      ...extractDocs(klass),
    };

    for (const method of klass.allMethods) {
      this.tryIntegrationMethod(klass, method);
    }
  }

  private extractMetrics(klass: reflect.ClassType): MetricInfo[] {
    void(klass);
    // FIXME: TODO
    return [];
  }

  /**
   * Try to see if this method adds an integration between two constructs
   *
   * We recognize a method as an integration method if it looks like this:
   *
   * ```
   * construct.addIntegration([id: string, ] integration: IIntegrationType)
   * ```
   *
   * Where `IIntegrationType` has one or more implementations that take a
   * construct as its first argument (and optionally a props struct).
   */
  private tryIntegrationMethod(source: reflect.ClassType, method: reflect.Method) {
    if (method.static) { return; }

    const nameMatch = method.name.match(/^add([A-Z]\w+)$/);
    if (!nameMatch) { return; }

    const takesString = method.parameters.length > 0 && method.parameters[0].type.primitive === 'string';
    const integrationParameterIx = takesString ? 1 : 0;
    if (method.parameters.length !== integrationParameterIx + 1) { return; }
    const candidateType = method.parameters[integrationParameterIx].type.type;
    if (!candidateType || !isProtocol(candidateType)) { return; }

    for (const impl of candidateType.allImplementations.filter(isClassType)) {
      // The implementation must itself not be a construct (this avoids
      // detecting `addDefaultInternetRoute(string, IDependable)` as an integration).
      if (this.isConstruct(impl)) { return; }

      // We check for a constructor that takes a construct (as an interface) and an optional options struct
      if (!impl.initializer || ![1, 2].includes(impl.initializer.parameters.length)) { continue; }

      const converted = impl.initializer.parameters.map(p => this.convertTypeRef(p.type));
      const parameterTypesR = liftR(converted.map(liftR));

      if (isFailure(parameterTypesR)) {
        this.emitDiagnostic({
          fqn: impl.fqn,
          message: `cannot instantiate class: ${parameterTypesR.reason}`,
        });
        continue;
      }

      const parameterTypes = unwrap(parameterTypesR);

      const integrationTargets = parameterTypes[0].filter(isConstructType);
      const integrationOptionsTypes = (parameterTypes[1] ?? []).filter(isStructType);

      for (const target of integrationTargets) {
        this.recordIntegration({
          sourceConstructFqn: source.fqn,
          targetConstructFqn: target.constructFqn,
          integrationFqn: impl.fqn,
          integrationName: nameMatch[1],
          methodName: method.name,
          methodTakesId: takesString,
          integrationOptionsTypes,
          ...extractDocs(impl),
        });
      }
    }
  }

  /**
   * Record a construct integration in the main table and indexes
   */
  private recordIntegration(integ: IntegrationInfo) {
    const key = `i${this.integrationCtr++}`;

    this.constructInfo.integrations[key] = integ;
    addToList(this.constructInfo.integrationsBySource, integ.sourceConstructFqn, key);
    addToList(this.constructInfo.integrationsByTarget, integ.targetConstructFqn, key);
  }

  /**
   * An enum is always an enum
   */
  private tryEnum(enm: reflect.EnumType) {
    this.constructInfo.enums[enm.fqn] = {
      fqn: enm.fqn,
      displayName: displayName(enm.name),
      ...extractDocs(enm),

      members: enm.members.map(mem => ({
        displayName: displayName(mem.name),
        memberName: mem.name,
        ...extractDocs(mem),
      })),
    };
  }

  private tryEnumClass(klass: reflect.ClassType) {
    if (!this.isEnumClass(klass)) { return; }

    const factMethods = klass.allMethods.filter(m => isFactoryFunction(klass, m));
    const singletonProps = klass.allProperties.filter(x => isSingletonProperty(klass, x));

    const rizzons = [];

    const factories: EnumClassFactory[] = [];
    for (const m of factMethods) {
      const converted = m.parameters.map(p => this.convertTypeRef(p.type));
      const lifted = converted.map(liftR);
      const parameterTypes = liftR(lifted);

      if (isFailure(parameterTypes)) {
        rizzons.push(`cannot use factory ${m.name} (${parameterTypes.reason})`);
        continue;
      }

      const parms = unwrap(parameterTypes);
      const parameters: ParameterValue[] = m.parameters.map((p, i) => ({
        name: p.name,
        optional: p.optional,
        types: parms[i],
        ...extractDocs(p),
      }));

      factories.push({
        displayName: displayName(m.name),
        methodName: m.name,
        parameters,
        ...extractDocs(m),
      });
    }

    const singletons: EnumClassSingleton[] = [];
    for (const p of singletonProps) {
      singletons.push({
        displayName: displayName(p.name),
        propertyName: p.name,
        ...extractDocs(p),
      });
    }

    if (factories.length === 0 && singletons.length === 0) {
      this.emitDiagnostic({
        fqn: klass.fqn,
        message: `potential enum-class not instantiable: ${rizzons.join(', ')}`,
      });
      return;
    }

    this.constructInfo.enumClasses[klass.fqn] = {
      fqn: klass.fqn,
      displayName: klass.name,
      factories,
      singletons,
      ...extractDocs(klass),
    };
  }

  /**
   * A class is an enum class if it:
   *
   * - Is NOT a construct
   * - Has factory methods or singleton properties
   *
   * - Factory methods:
   *   - Has static functions that return the same type (factories)
   *      (NOTE: occasionally a supertype?)
   *   - Doesn't have any static methods that aren't factory functions
   */
  private isEnumClass(klass: reflect.ClassType) {
    if (this.isConstruct(klass)) { return false; }

    const statics = klass.allMethods.filter(m => m.static);
    const [factories, nonFactories] = partition(statics, m => isFactoryFunction(klass, m));
    const singletonProps = klass.allProperties.filter(p => isSingletonProperty(klass, p));

    const hasFactoryMethods = factories.length > 0 && nonFactories.length === 0;
    const hasSingletonProps = singletonProps.length > 0;

    return hasFactoryMethods || hasSingletonProps;
  }

  private hasEnumClassImplementors(iface: reflect.InterfaceType) {
    return iface.allImplementations.some(c => c.isClassType() && this.isEnumClass(c));
  }

  private tryStruct(struct: reflect.InterfaceType) {
    const allProperties = struct.allProperties.map(p => ({
      name: p.name,
      optional: p.optional,
      types: liftR(this.convertTypeRef(p.type)),
      ...extractDocs(p),
    }));


    const requiredFails = new Array<Failure>();
    const optionalFails = new Array<Failure>();
    const convertibleProps = new Array<ParameterValue>();
    for (const p of allProperties) {
      if (isFailure(p.types)) {
        (p.optional ? optionalFails : requiredFails).push(failure(`prop ${p.name}: ${p.types.reason}`));
      } else {
        convertibleProps.push({
          name: p.name,
          types: unwrap(p.types),
          optional: p.optional,
          remarks: p.remarks,
          summary: p.summary,
        });
      }
    }

    if (requiredFails.length > 0) {
      this.emitDiagnostic({
        fqn: struct.fqn,
        message: `struct not instantiable: ${reasons(requiredFails)}`,
      });
      return;
    }
    if (optionalFails.length > 0) {
      this.emitDiagnostic({
        fqn: struct.fqn,
        message: `dropped optional props: ${reasons(optionalFails)}`,
      });

    }

    this.constructInfo.structs[struct.fqn] = {
      fqn: struct.fqn,
      displayName: struct.name,
      properties: mkdict(convertibleProps.map(p => [p.name, p])),
      ...extractDocs(struct),
    };
  }

  private convertTypeRef(typeRef: reflect.TypeReference): Result<Type>[] {
    if (typeRef.arrayOfType) {
      const allElementTypes = this.convertTypeRef(typeRef.arrayOfType);
      const elementTypes = unwrapSuccesses(allElementTypes);
      if (elementTypes.length === 0) { return allElementTypes.filter(isFailure); }
      return [{ kind: 'array', elementTypes }];
    }

    if (typeRef.mapOfType) {
      const allElementTypes = this.convertTypeRef(typeRef.mapOfType);
      const elementTypes = unwrapSuccesses(allElementTypes);
      if (elementTypes.length === 0) { return allElementTypes.filter(isFailure); }
      return [{ kind: 'map', elementTypes }];
    }

    if (typeRef.unionOfTypes) {
      return typeRef.unionOfTypes.flatMap(inner => this.convertTypeRef(inner));
    }

    if (typeRef.primitive) {
      return [{ kind: 'primitive', primitiveType: typeRef.primitive as spec.PrimitiveType }];
    }

    const complexType = typeRef.type;
    if (!complexType) { return []; }

    // A complex type refers to a construct if it's itself a construct (unlikely)
    // or it's an interface that extends IConstruct (and then we find the implementing
    // classes)
    if (this.isConstruct(complexType)) {
      const impls = complexType.allImplementations.map(k => ({ kind: 'construct', constructFqn: k.fqn } as Type));
      if (impls.length > 0) { return impls; }
      return [failure(`no classes inherit from ${complexType.fqn}`)];
    }
    if (this.isConstructInterface(complexType)) {
      const impls = complexType.allImplementations
        .filter(k => this.isConstruct(k))
        .map(k => ({ kind: 'construct', constructFqn: k.fqn } as Type));
      if (impls.length > 0) { return impls; }
      return [failure(`no classes implement ${complexType.fqn}`)];
    }

    if (complexType.isDataType()) {
      return [{ kind: 'struct', structFqn: complexType.fqn }];
    }

    if (complexType.isClassType() && this.isEnumClass(complexType)) {
      return [{ kind: 'enum-class', enumClassFqn: complexType.fqn }];
    }

    if (complexType.isInterfaceType() && !complexType.isDataType() && this.hasEnumClassImplementors(complexType)) {
      return [{ kind: 'enum-class', enumClassFqn: complexType.fqn }];
    }

    if (complexType.isEnumType()) {
      return [{ kind: 'enum', enumFqn: complexType.fqn }];
    }

    return [failure(`Cannot represent type ${typeRef}`)];
  }

  /**
   * For all detected construct infos, check that all type references ended up materializing to actual types
   *
   * If not, scrap the top-level constructs again. Do this until nothing changes anymore.
   *
   * Return whether we removed something.
   */
  private removeNonconstructibleTypes(): boolean {
    let removedType = false;
    for (const [fqn, construct] of Object.entries(this.constructInfo.constructs)) {
      const r = this.removeInvalidTypeRefs(construct.constructPropertyTypes);
      if (!isFailure(r)) { continue; }

      delete this.constructInfo.constructs[fqn];
      removedType = true;
      this.emitDiagnostic({ fqn, message: `dropped construct, not all types representable: ${r.reason}` });
    }

    for (const [fqn, struct] of Object.entries(this.constructInfo.structs)) {
      for (const [propName, propValue] of Object.entries(struct.properties)) {
        const r = this.removeInvalidTypeRefs(propValue.types);
        if (!isFailure(r)) { continue; }

        if (propValue.optional) {
          delete struct.properties[propName];
          this.emitDiagnostic({ fqn, message: `dropped optional property '${propName}': type not representable: ${r.reason}` });
          continue;
        }

        delete this.constructInfo.structs[fqn];
        removedType = true;
        this.emitDiagnostic({ fqn, message: `dropped struct, not all required types representable: ${r.reason}` });
      }
    }

    for (const [fqn, enumclass] of Object.entries(this.constructInfo.enumClasses)) {
      const fails = new Array<Failure>();

      const deletableFactories = new Set(enumclass.factories.flatMap(fac => {
        // If this factory has any unrepresentable parameters, remove it
        const paramFailures = fac.parameters.map(param => this.removeInvalidTypeRefs(param.types)).filter(isFailure);
        if (paramFailures.length > 0) {
          fails.push(failure(`unusable factory '${fac.methodName}': ${paramFailures.map(m => m.reason).join(', ')}`));
          return [fac];
        }
        return [];
      }));
      deleteInPlace(enumclass.factories, deletableFactories);

      if (enumclass.factories.length > 0 || enumclass.singletons.length > 0) {
        if (fails.length > 0) {
          this.emitDiagnostic({
            fqn,
            message: `problems with factories: ${fails.map(r => r.reason).join(', ')}`,
          });
        }
        continue;
      }

      delete this.constructInfo.enumClasses[fqn];
      removedType = true;
      this.emitDiagnostic({
        fqn,
        message: `dropped unconstructible class: ${fails.map(r => r.reason).join(', ')}`,
      });
    }

    for (const [key, integ] of Object.entries(this.constructInfo.integrations)) {
      const fails = [
        this.checkTypeRef({ kind: 'construct', constructFqn: integ.sourceConstructFqn }),
        this.checkTypeRef({ kind: 'construct', constructFqn: integ.targetConstructFqn }),
        this.removeInvalidTypeRefs(integ.integrationOptionsTypes),
      ].filter(isFailure);

      if (fails.length > 0) {
        delete this.constructInfo.integrations[key];
        removeValue(this.constructInfo.integrationsBySource, key);
        removeValue(this.constructInfo.integrationsByTarget, key);

        removedType = true;
        this.emitDiagnostic({
          fqn: integ.integrationFqn,
          message: `dropped integration: ${fails.map(r => r.reason).join(', ')}`,
        });
      }
    }

    return removedType;
  }

  /**
   * Filter a set of type-refs down in-place.
   *
   * - If the set ends up non-empty, emit diagnostics for the types we removed.
   * - If the set ends up empty, don't emit diagnostics and return a failure for the types we removed.
   */
  private removeInvalidTypeRefs(xs: Type[] | undefined): Result<void> {
    if (!xs) { return undefined; }

    const fails = new Array<Failure>();
    let i = 0;
    while (i < xs.length) {
      const result = this.checkTypeRef(xs[i]);
      if (isFailure(result)) {
        fails.push(result);
        xs.splice(i, 1);
      } else {
        i += 1;
      }
    }

    if (xs.length === 0) {
      return failure(fails.map(f => f.reason).join(', '));
    }

    return undefined;
  }

  private checkTypeRef(x: Type): Result<void> {
    switch (x.kind) {
      case 'construct':
        if (!this.constructInfo.constructs[x.constructFqn]) {
          return failure(`construct was culled: ${x.constructFqn}`);
        }
        break;
      case 'struct':
        if (!this.constructInfo.structs[x.structFqn]) {
          return failure(`struct was culled: ${x.structFqn}`);
        }
        break;
      case 'enum-class':
        if (!this.constructInfo.enumClasses[x.enumClassFqn]) {
          return failure(`enum-class was culled: ${x.enumClassFqn}`);
        }
        break;
    }
    return undefined;
  }

  private emitDiagnostic(d: Diagnostic) {
    this.diagnostics.push(d);
  }
}

export interface Diagnostic {
  readonly fqn: string;
  readonly message: string;
}

function extractDocs(d: reflect.Documentable) {
  return {
    summary: d.docs.summary,
    remarks: d.docs.remarks,
  };
}

function isStructType(k: Type): k is Extract<Type, { kind: 'struct' }> {
  return k.kind === 'struct';
}

function isConstructType(k: Type): k is Extract<Type, { kind: 'construct' }> {
  return k.kind === 'construct';
}

/**
 * A factory function is a function that is:
 *
 * - Static public
 * - Has a return type which is a subtype of the parent class, or a supertype which
 *   lives in the same submodule.
 */
function isFactoryFunction(klass: reflect.ClassType, m: reflect.Method): boolean {
  const returnType = m.returns.type.type;
  if (!returnType || !m.static || m.protected) { return false; }
  return returnType.extends(klass) || extendsTypeInSameSubmodule(klass, returnType);
}

/**
 * A property is a singleton property if it is:
 *
 * - Static public readonly
 * - Has a type that is a subtype of the parent class, or a supertype which lives in
 *   the same submodule.
 */
function isSingletonProperty(klass: reflect.ClassType, p: reflect.Property): boolean {
  const type = p.type.type;
  if (!type || !p.static || p.protected || !p.immutable) { return false; }
  return type.extends(klass) || extendsTypeInSameSubmodule(klass, type);
}

function extendsTypeInSameSubmodule(subtype: reflect.Type, supertype: reflect.Type) {
  if (!subtype.extends(supertype)) { return false; }
  return submoduleFqn(subtype.fqn) === submoduleFqn(supertype.fqn);
}

function submoduleFqn(fqn: string) {
  const parts = fqn.split('.');
  return parts.slice(0, parts.length - 1).join('.');
}

function unwrapSuccesses<A>(xs: Result<A>[]): A[] {
  return xs.filter(isSuccess).map(unwrap);
}

function isClassType(x: reflect.Type): x is reflect.ClassType {
  return x.isClassType();
}

function isStruct(type: reflect.Type): type is reflect.InterfaceType {
  return type.isDataType();
}

function isProtocol(type: reflect.Type): type is reflect.InterfaceType {
  return type.isInterfaceType() && !type.isDataType();
}

function addToList<A>(xs: Record<string, A[]>, key: string, value: A) {
  if (!(key in xs)) {
    xs[key] = [];
  }
  xs[key].push(value);
}

function displayName(x: string) {
  return Case.pascal(x);
}

function deleteInPlace<A>(xs: A[], del: Set<A>) {
  let i = 0;
  while (i < xs.length) {
    if (del.has(xs[i])) {
      xs.splice(i, 1);
    } else {
      i += 1;
    }
  }
}

function removeValue(xs: Record<string, string[]>, value: string) {
  for (const arr of Object.values(xs)) {
    deleteInPlace(arr, new Set([value]));
  }
}