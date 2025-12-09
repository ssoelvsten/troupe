import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsNTuple, assertIsProcessId } from '../Asserts.mjs'


export function BuiltinSend<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        send = mkBuiltin((larg) => {
            let $r = this.runtime
            $r.$t.raiseProgramCounterToBlockingLevel();
            assertNormalState("send")
            $r.$t.raiseProgramCounter(larg.lev);
            assertIsNTuple(larg, 2);
            assertIsProcessId(larg.val[0]);
            let arg = larg.val;
            // we need to check whether the recipient process is local
            // if yes, then we just proceed by adding the message to the
            // local mailbox; otherwise we need to proceed to serialization
            // external call.

            let lRecipientPid = arg[0];
            // debug ("* rt rt_send *", lRecipientPid);
            $r.$t.raiseProgramCounter(lRecipientPid.lev); // this feels a bit odd.
            let message = arg[1];

            return $r.sendByValue(lRecipientPid, message)

        }, "send");
    }
}