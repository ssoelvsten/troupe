import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs';
import { LVal } from '../Lval.mjs';
import * as levels from '../Level.mjs';
import { Authority } from '../Authority.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel } from '../Asserts.mjs';
const {lub, flowsTo} = levels;


export function BuiltinAttenuate<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        attenuate = mkBase((arg) => {
            assertIsNTuple(arg, 2);
            const argv = arg.val;
            const authFrom = argv[0];
            assertIsAuthority(authFrom);
            const levTo = argv[1];
            assertIsLevel(levTo);

            const ok_to_attenuate = levels.actsFor(authFrom.val.authorityLevel, levTo.val);

            // todo: 2018-10-18: AA; are we missing anything?
            const l_meta = lub(this.runtime.$t.pc, arg.lev, authFrom.lev, levTo.lev);
            const l_auth = ok_to_attenuate ? levTo.val : levels.BOT;
            const r = new LVal(new Authority(l_auth), l_meta);

            return this.runtime.ret(r);
        }, "attenuate");

    };
}