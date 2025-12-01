'use strict';

import { v4 as uuidv4} from 'uuid'
import { Thread } from './Thread.mjs';
import runId from './runId.mjs';
import { mkTuple } from './ValuesUtil.mjs';
import { SchedulerInterface } from './SchedulerInterface.mjs';
import { RuntimeInterface } from './RuntimeInterface.mjs';
import { LVal } from './Lval.mjs'
import { Level } from "./Level.mjs";
import {ProcessID, pid_equals} from './process.mjs'
import SandboxStatus from './SandboxStatus.mjs'
import  {ThreadError, TroupeError} from './TroupeError.mjs'
import  {lub} from './Level.mjs'

import {SYSTEM_PROCESS_STRING} from './Constants.mjs'

import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
const argv = getCliArgs();

/** Enum for termination statuses. */
export enum ThreadType {
    /** System service thread. */
    System = -1,
    /** Main thread. */
    Main   = 0,
    /** Other threads, spawned from 'Main' or 'System'. */
    Other  = 1
}

export class Scheduler implements SchedulerInterface {
    // Current thread state

    /** Current thread alive */
    __currentThread: Thread;

    /** FIFO queue of all threads to evaluate */
    __funloop: Thread[];

    /** Queue of blocked threads. */
    __blocked: { [tid in string]: Thread };

    /** Map of alive threads from their stringified identifier, `tid`. */
    __alive: { [tid in string]: Thread };

    // Dependencies for unique thread identifier creation.
    rt_uuid: any;
    __node: any;

    // Runtime dependencies
    rtObj : RuntimeInterface
    __stopWhenAllThreadsAreDone: boolean;
    __stopRuntime: () => void;

    /*************************************************************************************************\
    Scheduler state
    \*************************************************************************************************/

    /**  */
    constructor(rtObj: RuntimeInterface) {
        this.rt_uuid = runId;
        this.rtObj = rtObj;
        this.__funloop = [];
        this.__blocked = {};
        this.__alive = {};
        this.__currentThread = null;
    }

    /** Initialisation of the scheduler based on the p2p layer, e.g. the `node` identifier and
     *  the scheduler should proceed despite all threads being done. */
    initScheduler(node, stopWhenAllThreadsAreDone, stopRuntime) {
        this.__node = node;
        this.__stopWhenAllThreadsAreDone = stopWhenAllThreadsAreDone;
        this.__stopRuntime = stopRuntime;
    }

    /** Kill all threads except the current one, staying ready for spawning new threads.
     *
     *  @note This does not notify the monitors. */
    resetScheduler() {
        for (let x in this.__alive) {
            if (this.__currentThread.tid.val.toString() !== x) {
                delete this.__alive[x];
            }
        }
        this.__blocked = {};
        this.__funloop = [];
    }

    /*************************************************************************************************\
    Thread creation
    \*************************************************************************************************/

    /** Add a thread `t` to the active function loop. */
    scheduleThread(t: Thread) {
        this.__funloop.push(t);
    }

    /** Create a new thread `t` for the given function to be evaluated and schedule it.
     *
     *  NOTE (20-10-2025; SS): A hypothesis about the Javascript event loop:
     *
     *       It would be a more clean design to return the thread identifier of type `LVal`, as we
     *       do right now, together with a `Promise<LVal>` of the final returned value. But, since
     *       the Javascript event loop is a LIFO queue, i.e. a stack, this would bury resolving the
     *       termination of each thread (especially the *main* thread) beneath everything else.
     */
    scheduleNewThread(f: () => any,
                      arg: any,
                      pc: Level,
                      block: Level,
                      tType: ThreadType = ThreadType.Other,
                      cb: (LVal) => void = (_) => {})
    {
        // Create a new process ID at the given level.
        const pid = tType === ThreadType.System ? SYSTEM_PROCESS_STRING : uuidv4();
        const tid = new LVal(new ProcessID(this.rt_uuid, pid, this.__node), pc);

        const halt = () => {
            this.__currentThread.raiseCurrentThreadPCToBlockingLev();
            this.notifyMonitors();

            const currT = this.__currentThread;
            const retVal = new LVal (currT.r0_val, lub(currT.bl, currT.r0_lev), lub(currT.bl, currT.r0_tlev));

            delete this.__alive[this.__currentThread.tid.val.toString()];

            cb(retVal);
        }

        // New thread
        const sStatus = new SandboxStatus.NORMAL();
        const t = new Thread(tid, halt, f, arg, pc, block, sStatus, this.rtObj, this);

        this.__alive[tid.val.toString()] = t;
        this.scheduleThread(t);

        return tid as LVal;
    }

    /*************************************************************************************************\
    Thread access
    \*************************************************************************************************/

    /** Whether the thread with identifier, `tid`, is alive. */
    isAlive(tid: LVal) {
        return (this.__alive[tid.val.toString()] != null);
    }

    /** The thread object with the given identifier, `tid`. */
    getThread (tid: LVal) {
        return this.__alive[tid.val.toString()];
    }

    /** The currently scheduled thread */
    getCurrentThread() {
        return this.__currentThread;
    }

    /** Overwrites the current thread; the previously current thread is returned. */
    setCurrentThread(t: Thread) {
        const prev = this.__currentThread
        this.__currentThread = t;
        return prev;
    }

    /*************************************************************************************************\
    Thread blocking/unblocking
    \*************************************************************************************************/

    /** Block thread object `t`. */
    blockThread(t: Thread) {
        this.__blocked[t.tid.val.toString()] = t;
    }

    /** Unblock the thread with the given identifier, `pid`. */
    unblockThread(tid: LVal) {
        if (!this.__blocked[tid.val.toString()]) { return; }

        this.scheduleThread(this.__blocked[tid.val.toString()]);
        delete this.__blocked[tid.val.toString()];
    }

    /*************************************************************************************************\
    Thread Termination
    \*************************************************************************************************/

    /** Notify monitors about thread termination. */
    notifyMonitors (errMsg : string | null = null) {
        let mkVal = this.__currentThread.mkVal;
        let ids = Object.keys(this.__currentThread.monitors);
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
            let toPid = this.__currentThread.monitors[id].pid;
            let refUUID = this.__currentThread.monitors[id].uuid;
            let thisPid = this.__currentThread.tid;
            let statusVal = this.__currentThread.mkVal(errMsg !== null ? 1 : 0);
            let reason = errMsg !== null
                ? statusVal
                : mkTuple ([statusVal,  mkVal (errMsg)]);
            let message = mkVal (mkTuple([ mkVal("DONE"), refUUID, thisPid, reason]));
            // false flag means no need to return in the process
            this.rtObj.sendMessageNoChecks( toPid, message, false);
        }
    }

    /** Kill thread `t` with the error message `s` sent to its monitors. */
    stopThreadWithErrorMessage (t: Thread, errMsg: string) {
        this.notifyMonitors(errMsg);
        delete this.__alive [t.tid.val.toString()];
    }

    /*************************************************************************************************\
    Scheduler loop
    \*************************************************************************************************/

    /** Start the main scheduler loop.
     *
     * HACK (2018-02-18: AA): a hypothesis about memory management in V8:
     *
     *      It appears that V8's memory management is not very well suited for infinitely running
     *      functions. In other words, functions are expected to eventually terminate, and all
     *      long-running computations are expected to run through the event loop. This is not
     *      surprising given the application where V8 is used. This is why we periodically yield to
     *      the event loop; this hack appears to let GC claim the objects allocated throughout the
     *      runtime of this function. Note that without this hack, we are observing memory leaks for
     *      many "server"-like programs; with the hack, we get a waivy memory consumption profile
     *      that reaches around 50M on the low points of the wave.
     */
    loop()  {
        const maxThreadsPerLoop = 500000;
        const maxKontsPerThread = 1000;

        let dest: () => any;
        try {
            for (let i = 0; i < maxThreadsPerLoop && this.__funloop.length > 0; ++i) {
                // Pop front of function queue and set it to be the next thread.
                this.__currentThread = this.__funloop.shift();
                if (!this.__alive[this.__currentThread.tid.val.toString()]) { continue; }

                dest = this.__currentThread.next;

                // Run thread for `maxKontsPerThread` continuations.
                for (let j = 0; dest && j < maxKontsPerThread; ++j) {
                    dest = dest();
                }

                // If not done, push it back into the queue.
                if (dest) {
                    this.__currentThread.handlerState.checkGuard();
                    this.__currentThread.next = dest;
                    this.__funloop.push(this.__currentThread);
                }
            }
        } catch (e) {
            if (e instanceof TroupeError) {
                e.handleError(this);
            } else {
                console.log("--- Schedule module caught an internal exception ---");
                console.log("--- The following output may help identify a bug in the runtime ---");
                console.log("Destination function\n", dest);

                if (argv[TroupeCliArg.ShowStack]) {
                    this.__currentThread.showStack();
                }
                throw e;
            }
        }

        // If more work is to be done, then resume `loop` after the Javascript runtime has been able
        // to run other tasks, e.g. garbage collection.
        if (this.__funloop.length > 0) {
            this.resumeLoopAsync();
        }

        // If everything is done, and the node should not persist, then terminate.
        if (this.__stopWhenAllThreadsAreDone && Object.keys(this.__alive).length == 0) {
            this.__stopRuntime();
        }
    }

    /** Add continuation of the main Troupe execution loop to the Javascript queue. In the meantime
     *  other code, e.g. the p2p and deserialization layers can run. */
    resumeLoopAsync() {
        setImmediate(() => { this.loop(); });
    }
}
