import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import { assertNormalState, assertIsNTuple, assertIsAuthority, assertIsNumber, assertIsRootAuthority } from '../Asserts.mjs'
import { unitLVal } from '../base/unitLVal.mjs';


export function BuiltinExit <TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        exit = mkBuiltin((arg) => {
            let $r = this.runtime
            assertNormalState("exit");
            assertIsNTuple(arg, 2);
            assertIsAuthority(arg.val[0]);
            assertIsNumber(arg.val[1]);
            assertIsRootAuthority(arg.val[0]);
            (async () => {
                await $r.cleanup()
                process.exit(arg.val[1].val);
            }) ()

        }, "exit")

        _resetScheduler = mkBuiltin((arg) => {
            assertNormalState("exit");
            assertIsAuthority(arg);
            assertIsRootAuthority(arg);
            this.runtime.__sched.resetScheduler ()
            return this.runtime.ret(unitLVal)
            
        })
    }
}