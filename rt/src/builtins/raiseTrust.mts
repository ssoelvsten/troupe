import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs';
import { LCopyVal } from '../Lval.mjs';
import { assertIsNTuple, assertIsAuthority, assertIsLevel, assertNormalState, assertIsString, assertIsRootAuthority } from '../Asserts.mjs';
import { __unit } from '../UnitVal.mjs';
import * as levels from '../Level.mjs';
import { __nodeManager } from '../NodeManager.mjs';
import { nodeTrustLevel, _trustMap } from '../TrustManager.mjs';

const { lub, flowsTo } = levels;

export function BuiltinRaiseTrust<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {

        raiseTrust = mkBase((arg) => {
            assertNormalState("raise trust");
            assertIsNTuple(arg, 3);

            const argv = arg.val;
            const data = argv[0];
            assertIsString(data);

            const authFrom = argv[1];
            assertIsAuthority(authFrom);
            assertIsRootAuthority(authFrom); // AA; 2019-03-07: may be a bit pessimistic, but okay for now
            const levTo = argv[2];
            assertIsLevel(levTo);

            const ok_to_raise =
                flowsTo(this.runtime.$t.bl, levels.BOT);
            if (!ok_to_raise) {
                this.runtime.$t.threadError("Cannot raise trust level when the process is tainted\n" +
                    ` | blocking label: ${this.runtime.$t.bl.stringRep()}`);
            }


            //flowsTo (levTo.val, authFrom.val.authorityLevel);
            // AA, 2018-10-20 : beware that no information flow is enforced here
            // let l_meta = lub (__sched.pc, arg.lev, authFrom.lev, levTo.lev)
            const l_raise = ok_to_raise ? levTo.val : levels.BOT;
            const nodeId = __nodeManager.getNode(data.val).nodeId;
            if (!nodeId) {
                this.runtime.$t.threadError(`Undefined node identifier ${data.val}`);
            }
            // let nodeId = data.val;
            const currentLevel = nodeTrustLevel(nodeId);
            _trustMap[nodeId] = lub(currentLevel, l_raise);
            return this.runtime.ret(__unit);
        }, "raiseTrust");

    };
}