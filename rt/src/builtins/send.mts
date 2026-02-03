import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsTupleWithArity, assertIsProcessId, assertIsAuthority } from '../Asserts.mjs'
import { Authority } from '../Authority.mjs';


export function BuiltinSend<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        send = mkBase((larg) => {
            let $r = this.runtime
            $r.$t.raiseCurrentThreadPCToBlockingLev();
            assertNormalState("send")
            $r.$t.raiseCurrentThreadPC(larg.lev);

            // Accept 2 or 3-tuple: (pid, msg) or (pid, msg, qauth)
            assertIsTupleWithArity(larg, [2, 3]);
            assertIsProcessId(larg.val[0]);

            let arg = larg.val;
            let lRecipientPid = arg[0];
            $r.$t.raiseCurrentThreadPC(lRecipientPid.lev);
            let message = arg[1];

            if (arg.length === 2) {
                // Standard 2-tuple send - no qauth
                return $r.sendMessageNoChecks(lRecipientPid, message);
            } else {
                // 3-tuple send with quarantine authority
                let authArg = arg[2];
                // assertIsAuthority raises blocking level via raiseBlockingThreadLev
                assertIsAuthority(authArg);
                let qauth: Authority = authArg.val;
                return $r.sendMessageNoChecks(lRecipientPid, message, qauth);
            }

        }, "send");
    }
}