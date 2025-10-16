import {UserRuntimeZero, Constructor, mkBase} from './UserRuntimeZero.mjs';
import { LVal } from '../Lval.mjs';
import { assertIsString, assertIsNTuple, assertIsNumber } from '../Asserts.mjs';
import { lub } from '../Level.mjs';


export function BuiltinString <TBase extends Constructor<UserRuntimeZero>> (Base:TBase) {
    return class extends Base {
        charCodeAtWithDefault = mkBase (arg => {
            assertIsNTuple(arg, 3);
            assertIsString(arg.val[0]);
            assertIsNumber(arg.val[1]);

            const s:string = arg.val[0].val;
            const j = arg.val[1].val;
            const lev = lub (arg.lev, arg.val[0].lev, arg.val[1].lev, arg.val[2].lev );

            if ( j >= s.length  || 0 > j ) {
                return this.runtime.ret (new LVal (arg.val[2].val, lev));
            } else {
                return this.runtime.ret (new LVal (s.charCodeAt(j), lev));
            }

        });

        strlen = mkBase (arg => {
            assertIsString(arg);
            const s: string  = arg.val ;
            return this.runtime.ret (new LVal (s.length, arg.lev));
        });

        substring = mkBase (arg => {
            assertIsNTuple(arg, 3);
            assertIsString(arg.val[0]);
            assertIsNumber(arg.val[1]);
            assertIsNumber(arg.val[2]);
            const s = arg.val[0].val;
            const i = arg.val[1].val;
            const j = arg.val[2].val;
            const s2 = s.substring (i,j);
            return this.runtime.ret (new LVal(s2, lub ( arg.lev
                                                      , arg.val[0].lev
                                                      , arg.val[1].lev
                                                      , arg.val[2].lev
                                                      )));
        });
    };

}