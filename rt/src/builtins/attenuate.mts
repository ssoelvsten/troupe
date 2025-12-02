import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { LVal } from '../base/LVal.mjs';
import * as levels from '../Level.mjs'
import { mkAuthority } from '../base/rawUtil.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel } from '../Asserts.mjs'
const {lub, flowsTo} = levels 


export function BuiltinAttenuate<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        attenuate = mkBuiltin((arg) => {
            assertIsNTuple(arg, 2);
            let argv = arg.val;
            let authFrom = argv[0];
            assertIsAuthority(authFrom);
            let levTo = argv[1];
            assertIsLevel(levTo);

            let ok_to_attenuate = levels.actsFor(authFrom.val.authorityLevel, levTo.val);

            // todo: 2018-10-18: AA; are we missing anything?
            let l_meta = lub(this.runtime.$t.pc, arg.lev, authFrom.lev, levTo.lev)
            let l_auth = ok_to_attenuate ? levTo.val : levels.BOT;
            let r = new LVal(mkAuthority(l_auth), l_meta)

            return this.runtime.ret(r)
        }, "attenuate")

    }
}