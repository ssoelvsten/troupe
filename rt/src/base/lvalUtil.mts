import { Hash, createHash, BinaryToTextEncoding } from 'node:crypto';

import { TroupeType } from './TroupeTypes.mjs';
import { LVal } from './LVal.mjs';
import { BOT } from '../Level.mjs';

import * as RawUtil from './rawUtil.mjs';
import { RawUnit } from './RawUnit.mjs';
import { RawProcessID } from './RawProcessID.mjs';
import { RawAuthority } from './RawAuthority.mjs';
import { RawAtom } from './RawAtom.mjs';
import { RawTuple } from './RawTuple.mjs';
import { RawRecord } from './RawRecord.mjs';
import { RawList } from './RawList.mjs';
import { unitLVal } from './unitLVal.mjs';

// ----------------------------------------------------------------------------
// TYPE CONSTRUCTORS

export function mkUnit(): LVal<RawUnit> {
    return unitLVal;
}

// ----------------------------------------------------------------------------
// TYPE PREDICATES (lifted from `rawUtil.mts`)

/** Predicate of whether `x` is a Troupe labelled value. */
export function isLVal(x: any): x is LVal<any> {
    return x._troupeType === TroupeType.LVal;
}

/** Predicate of whether `x` is a labelled Troupe unit object. */
export function isUnit(x: any): x is LVal<RawUnit> {
    return isLVal(x) && RawUtil.isUnit(x.val);
}

/** Predicate of whether `x` is a labelled boolean value. */
export function isBoolean(x: any): x is LVal<boolean> {
    return isLVal(x) && RawUtil.isBoolean(x.val);
}

/** Predicate of whether `x` is a labelled number. */
export function isNumber(x: any) : x is LVal<number> {
    return isLVal(x) && RawUtil.isNumber(x.val);
}

/** Predicate of whether `x` is a labelled string. */
export function isString(x: any) : x is LVal<string> {
    return isLVal(x) && RawUtil.isString(x.val);
}

/** Predicate of whether `x` is a labelled Troupe process id object. */
export function isProcessID(x : any) : x is LVal<RawProcessID> {
    return isLVal(x) && RawUtil.isProcessID(x.val);
}

/** Predicate of whether `x` is a labelled Troupe authority object. */
export function isAuthority(x: any) : x is LVal<RawAuthority> {
    return isLVal(x) && RawUtil.isAuthority(x.val);
}

/** Predicate of whether `x` is a labelled Troupe atom object. */
export function isAtom(x: any) : x is LVal<RawAtom> {
    return isLVal(x) && RawUtil.isAtom(x.val);
}

/** Predicate of whether `x` is a labelled Troupe tuple object. */
export function isTuple(x: any): x is LVal<RawTuple> {
    return isLVal(x) && RawUtil.isTuple(x.val);
}

/** Predicate of whether `x` is a labelled Troupe list object. */
export function isList(x: any): x is LVal<RawList> {
    return isLVal(x) && RawUtil.isList(x.val);
}

/** Predicate of whether `x` is a labelled Troupe record object. */
export function isRecord(x: any): x is LVal<RawRecord> {
    return isLVal(x) && RawUtil.isRecord(x.val);
}

// ----------------------------------------------------------------------------
// HASHING
type HashAlgorithm = "sha256";

type HashOptions = {
    algorithm?: HashAlgorithm,
    omitLevels?: boolean,
};

/** Hash a Troupe runtime value.
 *
 * @param x
 *    The labelled value (`LVal`) to be hashed.
 * @param omitLevels
 *    Whether the levels should be omitted from the hash.
 */
export function hash(x: LVal,
                     { algorithm = "sha256", omitLevels = false }: HashOptions = {})
    : LVal<string>
{
    const encoding: BinaryToTextEncoding = "base64";

    switch (x.troupeType) {
    // JavaScript basic types
    case TroupeType.Boolean:
    case TroupeType.Number:
    case TroupeType.String:
        // Treat the same way as Troupe basic types

    // Troupe basic types
    case TroupeType.Unit:
    case TroupeType.ProcessId:
    case TroupeType.Level:
    case TroupeType.Authority:
    case TroupeType.Capability:
    case TroupeType.Atom:
        // Since the `LVal::stringRep()` includes type information, e.g. `"`
        // around strings, we can merely hash the value's string
        // representation.
        const taintRef = { lev: BOT };
        const hasher = createHash(algorithm);
        hasher.update(x.stringRep(omitLevels, taintRef));
        return new LVal(hasher.digest(encoding), taintRef.lev, BOT);

    // Troupe function type (closure)
    case TroupeType.Closure:
        // TODO (SS; 2025-12-04): For closures, we need to hash the source
        //                        code in some way, i.e., the IR string.
        throw new Error(`hash(x: TroupeClosure) requires hashing the IR`);

    // Troupe local object
    case TroupeType.LocalObject:
        // TODO (SS; 2025-12-05): What should we do for local objects?
        throw new Error(`hash(x: LocalObject) is not hasheable`)

    // Troupe aggregate types
    default:
        // TODO (SS; 2025-12-04): The above `stringRep()` approach does not
        //                        work for aggregate types since records do
        //                        not have their keys sorted.
        throw new Error(`hash(x) not implemented for type ${x.troupeType}`);
    }
}

export function isHasheable(x: LVal): boolean {
    switch (x.troupeType) {
    // Troupe function type (closure)
    case TroupeType.Closure:
        return false;

    // Troupe aggregate types
    case TroupeType.Tuple:
    case TroupeType.List:
    case TroupeType.Record:
        return false;

    // Troupe local objects
    case TroupeType.LocalObject:
        return false;

    default:
        return true;
    }
}
