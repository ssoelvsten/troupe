import { UserRuntimeZero, Constructor, mkBuiltin } from './UserRuntimeZero.mjs'
import {lub} from '../Level.mjs'
import { assertNormalState, assertIsFunction, assertIsNode } from '../Asserts.mjs'
import { __nodeManager } from '../NodeManager.mjs';
import { unitLVal } from '../base/unitLVal.mjs';
import {SYSTEM_PROCESS_STRING} from '../Constants.mjs'
import { mkProcessID } from '../base/rawUtil.mjs';

export function BuiltinSpawn<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        _getSystemProcess = mkBuiltin ((arg) => {
            assertIsNode(arg.val)
            let node = __nodeManager.getNode(arg.val)
            let pid = mkProcessID (null, SYSTEM_PROCESS_STRING, node)
            return this.runtime.$t.mkVal (pid);
        })

        spawn = mkBuiltin((larg) => {
            assertNormalState("spawn")
            // debug ("* rt rt_spawn *", larg.val, larg.lev);
            // console.log ("SPAWN ARGS", larg)
            this.runtime.$t.raiseCurrentThreadPC(larg.lev);
            let arg = larg.val;

            const spawnLocal = (func) => {
                const tid = this.runtime.__sched.scheduleNewThread(
                    func, unitLVal, this.runtime.$t.pc, this.runtime.$t.bl);
                return this.runtime.$t.returnImmediateLValue(tid);
            }

            if (Array.isArray(arg)) {
                if (__nodeManager.isLocalNode(arg[0].val)) { // check if we are at the same node or note
                    // debug ("SAME NODE")
                    this.runtime.$t.raiseCurrentThreadPC(lub(arg[0].lev, arg[1].lev));
                    assertIsFunction(arg[1]);
                    return spawnLocal(arg[1].val)
                } else {
                    assertIsNode(arg[0]);
                    assertIsFunction(arg[1]);
                    (async () => this.runtime.spawnAtNode(arg[0], arg[1]))()

                }
            } else {
                assertIsFunction(larg);
                return spawnLocal(arg)
            }
        }, "spawn");
    }
}
