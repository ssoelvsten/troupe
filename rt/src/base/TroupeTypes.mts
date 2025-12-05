/**
 * Enum value to identify/encode the different Troupe objects.
 */
export const enum TroupeType {
  // --------------------------------------------------------------------------
  // base types
  Unit       = 0,
  Boolean    = 1,
  Number     = 2,
  String     = 3,
  ProcessId = 4,
  Level      = 5,
  Authority  = 6,
  Capability = 7,
  Atom       = 8,

  // --------------------------------------------------------------------------
  // aggregate types
  Closure = 100,
  LVal    = 101, // TODO (AA; 2020-03-03): should be only used for transports
  Tuple   = 102,
  List    = 103,
  Record  = 104,

  // --------------------------------------------------------------------------
  // unserializable objects type
  LocalObject = 200
}

/**
 * Enum value to identify the diffrent types of Troupe objects, i.e. Troupe
 * objects with `TroupeType.CLOSURE`.
 */
export const enum ClosureType {
  // okay to serialize
  RegularFn   = 0,

  // not to be serialized
  BuiltinFn   = 1,
  SandboxKont = 2,
  ServiceFn   = 3,
}

/**
 * Identifies whether the given closure type, `ct`, is intended for
 * serialization.
 */
export function isSerializableClosure(ct: ClosureType) : boolean  {
  return (ct === ClosureType.RegularFn);
}

/**
 * Infer the `TroupeType` of a given object.
 */
export function getTroupeType(x: any) : TroupeType {
  // Troupe Types
  if (x._troupeType !== undefined) {
    return x._troupeType;
  }

  // JavaScript types
  switch (typeof(x)) {
    case 'number':
      return TroupeType.Number
    case 'boolean':
      return TroupeType.Boolean
    case 'string':
      return TroupeType.String
  }

  // Must be something non-Troupe!
  throw new Error (`Cannot identify troupe type for value ${JSON.stringify(x)}  of type ${typeof x}`);
}
