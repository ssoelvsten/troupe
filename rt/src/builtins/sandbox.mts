import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs';
import { LVal, LValCopyAt } from '../Lval.mjs';
import { assertNormalState, assertIsNTuple, assertIsNumber, assertIsFunction } from '../Asserts.mjs';
import { __unit } from '../UnitVal.mjs';
import { getCliArgs, TroupeCliArg } from '../TroupeCliArgs.mjs';
const argv = getCliArgs();

const logLevel = argv[TroupeCliArg.DebugSandbox]? 'debug': 'info';
import { mkLogger } from '../logger.mjs';
const logger = mkLogger('MBX', logLevel);
const debug = x => logger.debug(x);

import SandboxStatus from '../SandboxStatus.mjs';
import { mkTuple } from '../ValuesUtil.mjs';
import { CALLSIZE, RETOFFSET, Thread } from '../Thread.mjs';
import { RawClosure, SandboxResumption } from '../RawClosure.mjs';
import { RuntimeInterface } from '../RuntimeInterface.mjs';

function rt_raisedToLev(x, y) {
    return new LValCopyAt(x, y);
}



function setupSandbox($r:RuntimeInterface, delay, resumeState = null) {
    const theThread : Thread = $r.$t;
    let done = false;
    let trapperInvoked = false;
    let retVal = null;
    $r.$t.raiseCurrentThreadPC(delay.lev);

    const threadState = theThread.exportState();
    const guard = () => {
        retVal = $r.$t.arg_as_lval;
        done = true;
    };

    if (resumeState) {
        theThread.importState(resumeState);
        theThread.callStack[CALLSIZE - RETOFFSET] = guard;
    } else {
        theThread.resetStackForSandboxing();
        $r.$t.pushFrame(guard);
    }





    const trapper = () => {
        trapperInvoked = true;
        retVal = __unit;
    };

    theThread.handlerState = new SandboxStatus.INSANDBOX(trapper, theThread.pc);



    function mk_tupleVal(x) {
        return theThread.mkVal(mkTuple(x));
    }

    function ok(x, l) {
        debug (`calling ok ${x.stringRep()}`);
        const statusOk = $r.$t.mkValWithLev(0, l);
        const y = rt_raisedToLev(x, l);
        return mk_tupleVal([statusOk, y]);
    }


    setTimeout(() => {
        const sandboxState = theThread.exportState();
        theThread.handlerState = new SandboxStatus.NORMAL();
        const resultLabel = $r.$t.bl;
        // Restore the state back to what it was before starting the sandboxing
        theThread.importState(threadState);
        function bad(x, l) {
            const statusBad = $r.$t.mkValWithLev(1, l);
            const y = rt_raisedToLev(x, l);
            return mk_tupleVal([statusBad, y]);
        }
        function resumeKont(sleepTimeout = null) {
            const statusBad = $r.$t.mkValWithLev(2, resultLabel);
            // console.log (sandboxState.callStack[sandboxState.callStack.length - 3].toString(), sandboxState.next.toString())
            const f = () => {
                const thread = $r.$t;
                const newdelay = thread.arg_as_lval; // new LVal (arg_val, arg_lev, arg_tlev);
                assertIsNumber(newdelay);
                setupSandbox($r, newdelay, sandboxState);
                // console.log ("sandbox setup")
                if (sleepTimeout) {
                    sleepTimeout.resume(thread);
                    return null;
                } else {
                    return $r.$t.next;
                }
            };
            const kont = new LVal(SandboxResumption(f), resultLabel);
            return mk_tupleVal([statusBad, kont]);
        }

        // __sched.raiseCurrentThreadPCToBlockingLev();

        // 2019-01-31: AA; obs: this is subtle

        // we check whether the thread is no longer scheduled
        if (done || trapperInvoked || theThread.sleeping) {
            if (done) {
                theThread.returnSuspended(ok(retVal, resultLabel));
            } else {
                if (theThread.sleeping) {
                    // console.log ("Thread is sleeping")
                    const _sleepTO = theThread.sleepTimeout;
                    theThread.sleepTimeout = null ;
                    _sleepTO.pause();
                    theThread.returnSuspended(resumeKont(_sleepTO));
                } else if (trapperInvoked) {
                    theThread.returnSuspended(bad(__unit, resultLabel));
                }
            }

            // because the thread has finished, we need
            // to push it back into the thread pool

            $r.__sched.scheduleThread(theThread);
            $r.__sched.resumeLoopAsync();

        } else {
            theThread.killCounter++;
            // the thread is alive and is somewhere in the scheduler queue, so
            // we just change its return kont
            theThread.returnSuspended(resumeKont());
        }
    }, delay.val);
}


export function BuiltinSandbox<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        sandbox = mkBase((arg) => {
            // return new Error ("not ported to new raw representation")
            // /*
            debug(`calling sandbox`);
            assertIsNTuple(arg, 2);
            assertIsNumber(arg.val[0]);
            assertIsFunction(arg.val[1]);
            const delay = arg.val[0];
            setupSandbox(this.runtime, delay);
            return this.runtime.$t.tailCall ( arg.val[1].val, __unit);
        },

            // this.tailcall(arg.val[1], __unit);
            // */
        "sandbox");
    };
}