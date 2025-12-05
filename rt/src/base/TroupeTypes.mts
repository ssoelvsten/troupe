/**
 * Enum value to identify/encode the different Troupe objects.
 */
export const enum TroupeType {
  // --------------------------------------------------------------------------
  // base types
  UNIT       = 0,
  BOOLEAN    = 1,
  NUMBER     = 2,
  STRING     = 3,
  PROCESS_ID = 4,
  LEVEL      = 5,
  AUTHORITY  = 6,
  CAPABILITY = 7,
  ATOM       = 8,

  // --------------------------------------------------------------------------
  // aggregate types
  CLOSURE = 100,
  LVAL    = 101, // TODO (AA; 2020-03-03): should be only used for transports
  TUPLE   = 102,
  LIST    = 103,
  RECORD  = 104,

  // --------------------------------------------------------------------------
  // unserializable objects type
  LOCALOBJECT = 200
}

/**
 * Enum value to identify the diffrent types of Troupe objects, i.e. Troupe
 * objects with `TroupeType.CLOSURE`.
 */
export const enum ClosureType {
  // okay to serialize
  REGULARFN   = 0,

  // not to be serialized
  BUILTINFN   = 1,
  SANDBOXKONT = 2,
  SERVICEFN   = 3,
}

/**
 * Identifies whether the given closure type, `ct`, is intended for
 * serialization.
 */
export function isSerializableClosure(ct: ClosureType) : boolean  {
  return (ct === ClosureType.REGULARFN);
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
      return TroupeType.NUMBER
    case 'boolean':
      return TroupeType.BOOLEAN
    case 'string':
      return TroupeType.STRING
  }

  // Must be something non-Troupe!
  throw new Error (`Cannot identify troupe type for value ${JSON.stringify(x)}  of type ${typeof x}`);
}
