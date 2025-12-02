'use strict'
import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';


export function BuiltinToString<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        toString = mkBuiltin((arg) => {
            let taintRef = { lev: this.runtime.$t.pc };
            let s = this.runtime.$t.mkCopy(arg).stringRep
                (true,  // omit labels
                    taintRef  // accumulate taint into this reference
                )

            let r = this.runtime.$t.mkValWithLev(s, taintRef.lev);
            return this.runtime.ret(r);
        }, "toString")


        toStringL = mkBuiltin((arg) => {
            let v = this.runtime.$t.mkCopy(arg);
            let taintRef = { lev: this.runtime.$t.pc };

            let s = v.stringRep(false,  // do not omit labels 
                taintRef  // accumulate taint into this reference
            )

            let r = this.runtime.$t.mkValWithLev(s, taintRef.lev);
            return this.runtime.ret(r);
        }, "toStringLabeled")
    }
}