import {UserRuntimeZero, Constructor, mkBuiltin} from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import { assertIsString, assertIsNTuple, assertIsNumber } from '../Asserts.mjs'
import { lub } from '../Level.mjs';


export function BuiltinString <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {
        charCodeAtWithDefault = mkBuiltin (arg => {
            assertIsNTuple(arg, 3); 
            assertIsString(arg.val[0])
            assertIsNumber(arg.val[1]);

            let s:string = arg.val[0].val 
            let j = arg.val[1].val 
            let lev = lub (arg.lev, arg.val[0].lev, arg.val[1].lev, arg.val[2].lev )

            if ( j >= s.length  || 0 > j ) {
                return this.runtime.ret (new LVal (arg.val[2].val, lev));
            } else {
                return this.runtime.ret (new LVal (s.charCodeAt(j), lev));
            }

        })

        strlen = mkBuiltin (arg => {
            assertIsString(arg);
            let s: string  = arg.val ;
            return this.runtime.ret (new LVal (s.length, arg.lev))
        })

        substring = mkBuiltin (arg => {
            assertIsNTuple(arg, 3)
            assertIsString(arg.val[0])
            assertIsNumber(arg.val[1])
            assertIsNumber(arg.val[2])
            let s = arg.val[0].val
            let i = arg.val[1].val 
            let j = arg.val[2].val 
            let s2 = s.substring (i,j) 
            return this.runtime.ret (new LVal(s2, lub ( arg.lev
                                                      , arg.val[0].lev
                                                      , arg.val[1].lev
                                                      , arg.val[2].lev
                                                      )))
        })
    }
 
}