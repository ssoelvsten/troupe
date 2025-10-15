'use strict';

import { v4 as uuidv4} from 'uuid'
import { Thread } from './Thread.mjs';
import runId from './runId.mjs';
import { mkTuple } from './ValuesUtil.mjs';
import { SchedulerInterface } from './SchedulerInterface.mjs';
import { RuntimeInterface } from './RuntimeInterface.mjs';
import { LVal } from './Lval.mjs'
import {ProcessID, pid_equals} from './process.mjs'
import SandboxStatus from './SandboxStatus.mjs'
import  {ThreadError, TroupeError} from './TroupeError.mjs'
import  {lub} from './Level.mjs'

import {SYSTEM_PROCESS_STRING} from './Constants.mjs'

import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
const argv = getCliArgs();
const showStack = argv[TroupeCliArg.ShowStack]

import { mkLogger } from './logger.mjs'
const logger = mkLogger('scheduler');
const info = x => logger.info(x)
const debug = x => logger.debug(x)

/** Enum for termination statuses. */
enum TerminationStatus {
    /** Thread finished its computation. */
    OK  = 0,
    /** Thread stopped early due to an error. */
    ERR = 1
}

export class Scheduler implements SchedulerInterface {
    // Current thread state

    /** Current thread alive */
    __currentThread: Thread;

    /** FIFO queue of all threads to evaluate */
    __funloop: Thread[];

    /** Queue of blocked threads. */
    __blocked: Thread[];

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
        this.__blocked = [];
        this.__alive = {};
        this.__currentThread = null;
    }

    /** Initialisation of the scheduler based on the p2p layer, e.g. the `node` identifier and
     *  the scheduler should proceed despite all threads being done. */
    initScheduler(node, stopWhenAllThreadsAreDone, stopRuntime) {
        this.__node = node;
        this.__stopWhenAllThreadsAreDone = stopWhenAllThreadsAreDone;
        this.__stopRuntime = stopRuntime
    }

    /** Kill all current threads (without notifying any monitors), staying ready for spawning new
     *  threads. */
    resetScheduler() {
        // console.log (`The current length of __funloop is ${this.__funloop.length}`)
        // console.log (`The number of active threads is ${Object.keys(this.__alive).length}`)
        for (let x in this.__alive) {            
            if (this.__currentThread.tid.val.toString() == x) {
                // console.log (x, "ACTIVE")
            } else {
                // console.log (x, "KILLING");
                delete this.__alive[x]
            }
        }
        this.__blocked = [];
        this.__funloop = [];
        // console.log (`The number of active threads is ${Object.keys(this.__alive).length}`)
        // console.log (`The number of blocked threads is ${this.__blocked.length}`)
    }

    /*************************************************************************************************\
    Thread creation
    \*************************************************************************************************/

    /** Add a thread `t` to the active function loop. */
    scheduleThread(t: Thread) {
        this.__funloop.push(t)
    }

    /** Create a new thread `t` for the given function to be evaluated and schedule it. */
    scheduleNewThreadAtLevel (thefun, arg, levpc, levblock, ismain = false, persist=null, isSystem = false) {
        // Create a new process ID at the given level.
        const pid = isSystem ? SYSTEM_PROCESS_STRING : uuidv4();
        const pidObj = new ProcessID(this.rt_uuid, pid, this.__node);
        const newPid =  new LVal(pidObj, levpc);

        // Epilogue for thread.
        const halt = ismain ?  () => { this.haltMain (persist) } :
                               () => { this.haltOther () };

        // New thread
        const t = new Thread
            ( newPid
            , halt
            , thefun
            , arg
            , levpc
            , levblock
            , new SandboxStatus.NORMAL()
            , this.rtObj
            , this );


        this.__alive[newPid.val.toString()] = t;
        this.scheduleThread (t)
        return newPid;
    }

    /** Schedule the given function as the very next thing to be run. */
    schedule(thefun, args, nm) {
        this.__currentThread.runNext (thefun, args, nm);
        this.scheduleThread(this.__currentThread)
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

    /*************************************************************************************************\
    Thread blocking/unblocking
    \*************************************************************************************************/

    /** Block thread object `t`. */
    blockThread(t: Thread) {
        this.__blocked.push(t)
    }

    /** Unblock the thread with the given identifier, `pid`. */
    unblockThread(tid: LVal) {
        for (let i = 0; i < this.__blocked.length; i++) {
            if (pid_equals(this.__blocked[i].tid, tid)) {
                this.scheduleThread(this.__blocked[i]);
                this.__blocked.splice(i, 1);
                break;
            }
        }
    }

    /*************************************************************************************************\
    Thread Termination
    \*************************************************************************************************/

    /** Notify monitors about thread termination. */
    notifyMonitors (status = TerminationStatus.OK, errstr = null) {
      let mkVal = this.__currentThread.mkVal
      let ids = Object.keys (this.__currentThread.monitors);
      for ( let i = 0; i < ids.length; i ++ ) {            
        let id = ids[i];
        let toPid = this.__currentThread.monitors[id].pid; 
        let refUUID = this.__currentThread.monitors[id].uuid; 
        let thisPid = this.__currentThread.tid;
        let statusVal = this.__currentThread.mkVal ( status ) ;
        let reason = TerminationStatus.OK == status ? statusVal : 
          mkTuple ( [statusVal,  mkVal (errstr)] );
        let message = mkVal (mkTuple ([ mkVal("DONE"), refUUID, thisPid, reason]))             
        this.rtObj.sendMessageNoChecks ( toPid, message , false) // false flag means no need to return in the process
      }
    }

    /** Epilogue for `main` thread: notify monitors, print and persist the final value  */
    haltMain  (persist=null)  {
        this.__currentThread.raiseCurrentThreadPCToBlockingLev()
        let retVal = new LVal (this.__currentThread.r0_val, 
                               lub(this.__currentThread.bl, this.__currentThread.r0_lev),
                               lub(this.__currentThread.bl, this.__currentThread.r0_tlev))

        this.notifyMonitors ();

      delete this.__alive[this.__currentThread.tid.val.toString()];
        console.log(">>> Main thread finished with value:", retVal.stringRep());
        if (persist) {
            this.rtObj.persist (retVal, persist )
            console.log ("Saved the result value in file", persist)
        }
        return null;
    }

    /** Epilogue for non-`main` threads: notify monitors  */
    haltOther  ()  {
        this.notifyMonitors();
        // console.log (this.__currentThread.processDebuggingName, this.__currentThread.tid.val.toString(), "done")
        delete this.__alive [this.__currentThread.tid.val.toString()];
    }

    /** Kill thread `t` with the error message `s` sent to its monitors. */
    stopThreadWithErrorMessage (t: Thread, s: string) {
        this.notifyMonitors(TerminationStatus.ERR, s) ;
        delete this.__alive [t.tid.val.toString()];
    }

    /*************************************************************************************************\
    Scheduler loop
    \*************************************************************************************************/

    /** Start the main scheduler loop.
     *
     * HACK (2018-02-18: AA): a hypothesis about memory management in V8
     *
     * It appears that V8's memory management is not very well suited for infinitely
     * running functions. In other words, functions are expected to eventually
     * terminate, and all long-running computations are  expected to run through the
     * event loop. This is not surprising given the application where V8 is used.
     * This is why we periodically yield to the event loop; this hack appears to let
     * GC claim the objects allocated throughout the runtime of this function.  Note
     * that without this hack, we are observing memory leaks for many "server"-like
     * programs; with the hack, we get a waivy memory consumption profile that reaches
     * around 50M on the low points of the wave.
     */
    loop()  {
        const $$LOOPBOUND = 500000;
        let _FUNLOOP = this.__funloop
        let _curThread: Thread; 
        let dest; 
        try {
            for (let $$loopiter = 0; $$loopiter < $$LOOPBOUND && _FUNLOOP.length > 0; $$loopiter ++ ) {
                _curThread = _FUNLOOP.shift();
                this.__currentThread = _curThread;
                dest = _curThread.next 
                let ttl = 1000;  // magic constant; 2021-04-29
                while (dest && ttl -- ) {
                    // 2021-04-24; AA; TODO: profile the addition of this conditional in this tight loop
                    // if (showStack) {
                    //     this.__currentThread.showStack()
                    // }
                    // console.log (">>>>>>>>>>")
                    // console.log (dest.toString())
                    // console.log ("<<<<<<<<<<")
                    // if (dest.debugname ) {
                    //     console.log (" -- ", dest.debugname)
                    // }
                    dest = dest ()
                }

                if (dest) {
                    _curThread.handlerState.checkGuard() 

                    _curThread.next = dest ;
                    _FUNLOOP.push (_curThread);
                }
            }    
        } catch (e) {
            if (e instanceof TroupeError) {
                e.handleError(this);
            } else {
                console.log ("--- Schedule module caught an internal exception ---")
                console.log ("--- The following output may help identify a bug in the runtime ---")
                console.log ("Destination function\n" , dest)
                this.__currentThread.showStack()
                throw e;
            }
        }

        if (_FUNLOOP.length > 0) {
            // we are not really done, but are just hacking around the V8's memory management
            this.resumeLoopAsync();
        }

        if (this.__stopWhenAllThreadsAreDone && Object.keys(this.__alive).length == 0 ) {
            this.__stopRuntime();
        }
    }

    /** Add continuation of the main Troupe execution loop to the Javascript queue. In the meantime
     *  other code, e.g. the p2p and deserialization layers can run. */
    resumeLoopAsync() {
        setImmediate(() => { this.loop(); });
    }
}
