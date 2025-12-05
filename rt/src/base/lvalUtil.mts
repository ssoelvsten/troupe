import { Hash, createHash, BinaryToTextEncoding } from 'node:crypto';

import { TroupeType } from './TroupeTypes.mjs';
import { LVal } from './LVal.mjs';
import { BOT } from '../Level.mjs';

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
                     { algorithm = "sha256", omitLevels = false }: HashOptions = {}
                    ): LVal
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
