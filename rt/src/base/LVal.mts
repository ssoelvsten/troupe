import * as levels from '../Level.mjs'
import { Level } from "../Level.mjs";
import * as Ty from './TroupeTypes.mjs';
import { RawValue } from './RawValue.mjs';

export class LVal implements RawValue {
    // TODO (SS; 2025-12-01): Make type of `val` generic (to improve type system).
    val: any;
    lev: Level;
    tlev: Level;
    dlev: Level;
    posInfo: string;

    constructor(val : any, lev : Level, tlev : Level | null = null, posInfo : string = null) {
        // TODO (2025-12-05): If `v` is another `LVal` do a copy of that object or
        //                    throw an error
        this.val = val;
        this.lev = lev;
        this.tlev = tlev == null ? lev : tlev;
        this.posInfo = posInfo;
        if (val._troupeType == undefined) {
            this.dlev = this.lev;
        } else {
            this.dlev = levels.lub(this.lev, val.dataLevel);
        }
    }

    get _troupeType() : Ty.TroupeType.LVAL {
        return Ty.TroupeType.LVAL;
    }

    get troupeType () : Ty.TroupeType {
        return Ty.getTroupeType(this.val);
    }

    get dataLevel () : Level {
        return this.dlev;
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


export class LValCopyAt extends LVal {
    constructor (x:LVal, l:Level, l2 = null) {
        if (l2 == null) {
            l2 = levels.lub(x.tlev,l)
        }
        super(x.val, levels.lub(x.lev, l), l2);
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
