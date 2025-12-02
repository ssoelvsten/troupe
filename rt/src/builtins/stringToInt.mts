'use strict'
import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import { assertIsNumber, assertIsString } from '../Asserts.mjs';


export function BuiltinStringToInt<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        stringToInt = mkBuiltin((arg) => {
            assertIsString(arg);
            let r = this.runtime.$t.mkValWithLev(parseFloat(arg.val), arg.lev);
            return this.runtime.ret(r);
        }, "stringToInt")

        intToString = mkBuiltin((arg) => {
            assertIsNumber (arg);
            let r = this.runtime.$t.mkValWithLev( arg.val.toString(), arg.lev );
            return this.runtime.ret (r);
        })
    }
}
