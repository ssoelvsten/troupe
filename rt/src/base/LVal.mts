import { BOT, Level, lub } from "../Level.mjs";
import * as Ty from './TroupeTypes.mjs';
import { TroupeFunction, TroupeValue } from './TroupeValue.mjs';

export class LVal<T = any> implements TroupeValue {
    val: T;
    lev: Level;
    tlev: Level;

    constructor(val : T, lev : Level = BOT, tlev : Level | null = null) {
        // TODO (2025-12-05): If `v` is another `LVal` do a copy of that object or
        //                    throw an error
        this.val = val;
        this.lev = lev;
        this.tlev = tlev == null ? lev : tlev;
    }

    /**
     * Safe copy of `x` while safely raising the level based on `x`, `lev` and
     * `tlev`.
     */
    static copy<T = any>(x: LVal<T>, lev: Level, tlev: Level | null = null) {
        tlev = tlev || lub(x.tlev, lev);
        return new LVal(x.val, lub(x.lev, lev), tlev);
    }

    /**
     * Creates a copy of `x` with new levels, `lev` and `tlev`. This is unsafe,
     * as `x.lev`, resp. `x.tlev`, may not flow to `lev`, resp. `tlev`.
     */
    static copyUnsafe<T = any>(x: LVal<T>, lev: Level, tlev: Level | null = null) {
        return new LVal(x.val, lev, tlev);
    }

    get _troupeType() : Ty.TroupeType.LVal {
        return Ty.TroupeType.LVal;
    }

    get troupeType () : Ty.TroupeType {
        return Ty.getTroupeType(this.val);
    }

    get dataLevel () : Level {
        return (this.val as TroupeValue).dataLevel
            ? lub(this.lev, (this.val as TroupeValue).dataLevel)
            : this.lev;
    }

    get closureType () : Ty.ClosureType | null  {
        return this.troupeType == Ty.TroupeType.Closure
            ? (this.val as TroupeFunction)._closureType
            : null;
    }

    stringRep(omitLevels?: boolean, taintRef?: any) {
        let output = "";

        // HACK (AA; 2018-05-17): Branch on JavaScript builtins based on the
        //                        existence of `stringRep`.
        //
        // TODO (SS; 2025-12-05): We can simplify the stuff below to
        //                        `v.toString(omitLevels, taintRef)` if we
        //                        rename `stringRep` to `toString`; JavaScript
        //                        supports calling functions with more
        //                        arguments than it was defined with.
        if ((this.val as TroupeValue).stringRep != undefined) {
            output = (this.val as TroupeValue).stringRep(omitLevels, taintRef);
        } else if (typeof this.val === 'string') {
            output = `"${this.val.toString()}"`;
        } else {
            output = this.val.toString();
        }

        if (taintRef) {
            taintRef.lev = lub(taintRef.lev, this.lev);
        }

        return omitLevels
            ? output
            : `${output}@${this.lev.stringRep()}%${this.tlev.stringRep()}`;
    }
}

export class MbVal extends LVal {
}

/** Identifies whether a value `x` is LVal(ish)
 *
 * @deprecated Use `isLVal` from `lvalUtil.mts` instead.
 */
export function isLVal(x) {
    return (typeof x.val != "undefined" &&
            typeof x.lev != "undefined" &&
            typeof x.tlev != "undefined");
}

/** Creates the string representation of LValues `xs`.
 *
 *  This can be used for debugging and as an aid to create the string representation
 *  of aggregate LValues.
 */
export function listStringRep(xs: LVal[], omitLevels: boolean = false, taintRef: any = null) {
  return xs.map(x => x.stringRep(omitLevels, taintRef)).join(', ');
}
