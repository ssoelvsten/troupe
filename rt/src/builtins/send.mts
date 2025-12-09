import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsNTuple, assertIsProcessId } from '../Asserts.mjs'
import { LVal } from '../base/LVal.mjs';
import { RawProcessID } from '../base/RawProcessID.mjs';


export function BuiltinSend<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        send = mkBuiltin((arg) => {
            this.runtime.$t.raiseProgramCounterToBlockingLevel();
            assertNormalState("send");
            this.runtime.$t.raiseProgramCounter(arg.lev);
            assertIsNTuple(arg, 2);
            assertIsProcessId(arg.val[0]);

            const toPid: LVal<RawProcessID> = arg.val[0];
            const message: LVal = arg.val[1];

            this.runtime.$t.raiseProgramCounter(toPid.lev); // this feels a bit odd.

            return this.runtime.sendByValue(toPid, message);
        }, "send");
    }
}