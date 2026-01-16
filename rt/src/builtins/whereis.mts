'use strict'
import { UserRuntimeZero, Constructor, mkBase } from './UserRuntimeZero.mjs'
import * as levels from '../Level.mjs'
import { Record } from '../Record.mjs'
import { LVal } from '../Lval.mjs'
import { ProcessID } from '../process.mjs';
const { lub, flowsTo } = levels
import {deserialize, IngressResult} from '../deserialize.mjs'
import { __nodeManager } from '../NodeManager.mjs';
import { assertNormalState, assertIsNTuple, assertIsString, assertIsProcessId, assertIsAuthority, assertIsRootAuthority, assertIsNode } from '../Asserts.mjs';
import { __unit } from '../UnitVal.mjs';
import { nodeTrustLevel } from '../TrustManager.mjs';
import { ErrorKind } from '../TroupeError.mjs';
export let __theRegister = {}
import {p2p} from '../p2p/p2p.mjs'

// import runId from '../runId.mjs';

import { getCliArgs, TroupeCliArg } from '../TroupeCliArgs.mjs';
const argv = getCliArgs();

let logLevel = argv[TroupeCliArg.Debug] ? 'debug': 'info'
import { mkLogger } from '../logger.mjs'
const logger = mkLogger('RTM', logLevel);
const debug = x => logger.debug(x)


export function BuiltinRegistry<TBase extends Constructor<UserRuntimeZero>>(Base: TBase) {
    return class extends Base {
        register = mkBase((arg) => {            
            let $r = this.runtime
            assertNormalState("register")
            assertIsNTuple(arg, 3);
            assertIsString(arg.val[0])
            assertIsProcessId(arg.val[1]);
            assertIsAuthority(arg.val[2]);
            assertIsRootAuthority(arg.val[2]);
            

            let ok_to_raise =
                flowsTo($r.$t.bl, levels.BOT);
            if (!ok_to_raise) {
                $r.$t.threadError("Cannot raise trust level when the process is tainted\s" +
                    ` | blocking label: ${$r.$t.bl.stringRep()}`, false, null, ErrorKind.IFCCheck)
            }


            // TODO: 2018-07-29: info flow checks
            // this is needed, because registration
            // is stateful

            let k = arg.val[0].val;
            let v = arg.val[1];

            __theRegister[k] = v;
            return $r.ret(__unit);
        }, "register")



        whereis = mkBase((arg) => {            
            let $r = this.runtime
            assertNormalState("whereis")
            assertIsNTuple(arg, 2);
            assertIsNode(arg.val[0]);
            assertIsString(arg.val[1]);
            $r.$t.raiseBlockingThreadLev(arg.val[0].lev);
            $r.$t.raiseBlockingThreadLev(arg.val[1].lev);

            let __sched = $r.__sched

            // let n = dealias(arg.val[0].val);    
            let n = __nodeManager.getNode(arg.val[0].val).nodeId;
            
            let k = arg.val[1].val;
            let nodeLev = nodeTrustLevel(n);
            let theThread = $r.$t;

            
            let okToLookup = flowsTo(lub($r.$t.pc, arg.val[0].lev, arg.val[1].lev), nodeLev);
            if (!okToLookup) {
                $r.$t.threadError("Information flow violation in whereis", false, null, ErrorKind.IFCCheck);
                return;
            }

            if (__nodeManager.isLocalNode(n)) {
                if (__theRegister[k]) {            
                    return $r.ret(__theRegister[k]) 
                }
            } else {
                (async () => {
                    try {
                        let body1 = await p2p.whereisp2p(n, k);
                        let result = await deserialize(nodeTrustLevel(n), body1);

                        // For whereis responses, DROP means we can't trust the pid we got back
                        if (result.result === IngressResult.DROP) {
                            debug(`Dropping corrupt whereis response from ${n}`);
                            theThread.throwInSuspended("Corrupt whereis response from remote node");
                            __sched.scheduleThread(theThread);
                            __sched.resumeLoopAsync();
                            return;
                        }

                        let body = result.value!;
                        let pid = new ProcessID(body.val.uuid, body.val.pid, body.val.node);

                        theThread.returnSuspended(theThread.mkValWithLev(pid, body.lev));
                        __sched.scheduleThread(theThread);
                        __sched.resumeLoopAsync();

                    } catch (err) {
                        $r.debug("whereis error: " + err.toString())
                        throw err;
                    }

                })()
            }
        }, "whereis")


        qwhereis = mkBase((arg) => {
            let $r = this.runtime
            assertNormalState("qwhereis")
            assertIsNTuple(arg, 2);
            assertIsNode(arg.val[0]);
            assertIsString(arg.val[1]);
            $r.$t.raiseBlockingThreadLev(arg.val[0].lev);
            $r.$t.raiseBlockingThreadLev(arg.val[1].lev);

            let __sched = $r.__sched

            let n = __nodeManager.getNode(arg.val[0].val).nodeId;

            let k = arg.val[1].val;
            let nodeLev = nodeTrustLevel(n);
            let theThread = $r.$t;


            let okToLookup = flowsTo(lub($r.$t.pc, arg.val[0].lev, arg.val[1].lev), nodeLev);
            if (!okToLookup) {
                $r.$t.threadError("Information flow violation in qwhereis", false, null, ErrorKind.IFCCheck);
                return;
            }

            if (__nodeManager.isLocalNode(n)) {
                if (__theRegister[k]) {
                    let pidLVal = __theRegister[k];
                    // Local lookup: no quarantine possible, so no quarantineAuth field
                    let resultRecord = Record.mkRecord([
                        ["processId", pidLVal]
                    ]);
                    return $r.ret(new LVal(resultRecord, pidLVal.lev));
                }
            } else {
                (async () => {
                    try {
                        let body1 = await p2p.whereisp2p(n, k);
                        let result = await deserialize(nodeTrustLevel(n), body1);

                        // For qwhereis responses, DROP means we can't trust the pid we got back
                        if (result.result === IngressResult.DROP) {
                            debug(`Dropping corrupt qwhereis response from ${n}`);
                            theThread.throwInSuspended("Corrupt whereis response from remote node");
                            __sched.scheduleThread(theThread);
                            __sched.resumeLoopAsync();
                            return;
                        }

                        let body = result.value!;
                        let pid = new ProcessID(body.val.uuid, body.val.pid, body.val.node);
                        let pidLVal = new LVal(pid, body.lev);

                        // Build record fields - only include quarantineAuth if quarantine occurred
                        let fields: [string, LVal][] = [["processId", pidLVal]];
                        if (result.quarantineAuth) {
                            fields.push(["quarantineAuth", new LVal(result.quarantineAuth, levels.BOT)]);
                        }
                        let resultRecord = Record.mkRecord(fields);

                        theThread.returnSuspended(theThread.mkValWithLev(resultRecord, body.lev));
                        __sched.scheduleThread(theThread);
                        __sched.resumeLoopAsync();

                    } catch (err) {
                        $r.debug("qwhereis error: " + err.toString())
                        throw err;
                    }

                })()
            }
        }, "qwhereis")

    }
}