import {UserRuntimeZero, Constructor, mkBuiltin} from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import * as levels  from '../Level.mjs'
import { assertIsUnit, assertIsNumber } from '../Asserts.mjs'


export function BuiltinMath <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {

         random = mkBuiltin((arg) => {
            assertIsUnit(arg);
            return this.runtime.ret(new LVal(Math.random(), levels.BOT, levels.BOT))
        })

        ceil = mkBuiltin((arg) => {
            assertIsNumber(arg);
            return this.runtime.ret(new LVal(Math.ceil(arg.val), arg.lev, arg.tlev));
        })

        round = mkBuiltin((arg) => {
            assertIsNumber(arg);
            return this.runtime.ret(new LVal(Math.round(arg.val), arg.lev, arg.tlev));
        })

        floor = mkBuiltin((arg) => {
            assertIsNumber(arg);
            return this.runtime.ret(new LVal(Math.floor(arg.val), arg.lev, arg.tlev));
        })

        sqrt = mkBuiltin((arg) => {
            assertIsNumber(arg);
            return this.runtime.ret(new LVal(Math.sqrt(arg.val), arg.lev, arg.tlev));
        })

        
    }
}