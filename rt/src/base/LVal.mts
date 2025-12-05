import * as levels from '../Level.mjs'
import { Level } from "../Level.mjs";
import * as Ty from './TroupeTypes.mjs';
import { RawValue } from './RawValue.mjs';

export class LVal implements RawValue {
    // TODO (SS; 2025-12-01): Make type of `val` generic (to improve type system).
    val: any;
    lev: Level;
    tlev: Level;

    constructor(val : any, lev : Level, tlev : Level | null = null) {
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
    static copy(x: LVal, lev: Level, tlev: Level | null = null) {
        tlev = tlev || levels.lub(x.tlev, lev);
        return new LVal(x.val, levels.lub(x.lev, lev), tlev);
    }

    get _troupeType() : Ty.TroupeType.LVAL {
        return Ty.TroupeType.LVAL;
    }

    get troupeType () : Ty.TroupeType {
        return Ty.getTroupeType(this.val);
    }

    get dataLevel () : Level {
        return this.val.dataLevel
            ? levels.lub(this.lev, this.val.dataLevel)
            : this.lev;
    }

    get closureType () : Ty.ClosureType | null  {
        return this.troupeType == Ty.TroupeType.CLOSURE
            ? this.val._closureType
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
        if (this.val.stringRep != undefined) {
            output = this.val.stringRep(omitLevels, taintRef);
        } else if (typeof this.val === 'string') {
            output = `"${this.val.toString()}"`;
        } else {
            output = this.val.toString();
        }

        if (taintRef) {
            taintRef.lev = levels.lub(taintRef.lev, this.lev);
        }

        return omitLevels
            ? output
            : `${output}@${this.lev.stringRep()}%${this.tlev.stringRep()}`;
    }
}

export class LCopyVal extends LVal {
    constructor (x:LVal, l1:Level, l2:Level = null) {
        super(x.val, l1, l2);
    }
}


export class MbVal extends LVal {
}

/** Identifies whether a value `x` is LVal(ish). */
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
