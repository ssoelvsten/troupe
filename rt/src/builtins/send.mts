import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsNTuple, assertIsProcessId } from '../Asserts.mjs'
import { LVal } from '../base/LVal.mjs';
import { RawProcessID } from '../base/RawProcessID.mjs';
import { unitLVal } from '../base/unitLVal.mjs';


export function BuiltinSend<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        sendByValue = mkBuiltin((arg: LVal) => {
            this.runtime.$t.raiseProgramCounterToBlockingLevel();
            assertNormalState("sendByValue");
            this.runtime.$t.raiseProgramCounter(arg.lev);
            assertIsNTuple(arg, 2);
            assertIsProcessId(arg.val[0]);

            const toPid: LVal<RawProcessID> = arg.val[0];
            const message: LVal = arg.val[1];

            this.runtime.$t.raiseProgramCounter(toPid.lev); // this feels a bit odd.

            this.runtime.sendByValue(toPid, message);
            return this.runtime.ret(unitLVal);
        }, "sendByValue");

        send = mkBuiltin((/* arg */) => {
            // Argument `arg` is passed along via the state of the thread's stack.
            return this.sendByValue(/* arg */);
        }, "send");
    }
}