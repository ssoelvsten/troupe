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

    /* 2020-06-06: AA

       Observe that we only need the type information here only because of the
       base type such as booleans, strings, and numbers; becauase we cannot attach
       properties to them in JS.

       The main downside of duplicating the type information is the duplication of
       this information during serialization
    */
    __troupeType : Ty.TroupeType;

    constructor(val : any, lev : Level, tlev : Level | null = null, posInfo : string = null) {
        this.val = val;
        this.lev = lev;
        this.tlev = tlev == null ? lev : tlev;
        this.posInfo = posInfo;
        if (val._troupeType == undefined) {
            this.__troupeType = Ty.getTypeForBasicValue(val);
            this.dlev = this.lev;
        } else {
            this.__troupeType = val._troupeType;
            this.dlev = levels.lub(this.lev, val.dataLevel);
        }
    }

    get _troupeType() : Ty.TroupeType.LVAL {
        return Ty.TroupeType.LVAL;
    }
    get troupeType () : Ty.TroupeType {
        return this.__troupeType;
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
      let v = this.val;
      let l = this.lev;
      let t = "";
      if (v.stringRep != undefined) { // 2018-05-17; AA; ugly hack!
          t = v.stringRep(omitLevels, taintRef);
      } else {
          if (typeof v === 'string') {
              t = `"${v.toString()}"`;
          } else {
              t = v.toString();
          }
      }

      if (l.stringRep == undefined) {
          console.log("undefined stringrep", l);
      }

      let s = t;

      if (!omitLevels) {
          s = s + "@" + l.stringRep() + "%" + this.tlev.stringRep();
      }

      if (taintRef) {
          taintRef.lev = levels.lub(taintRef.lev, l);
      }

      return s;
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
