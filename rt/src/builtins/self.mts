import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'

/**
 * Returns a string corresponding to the node identify
 * from a process
 */

export function BuiltinSelf<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        self = mkBuiltin((arg) => {
            return this.runtime.ret(this.runtime.__sched.getCurrentThread().tid);
        }, "self");
    }
}