import { SchedulerInterface } from "./SchedulerInterface.mjs";
import { Thread } from "./Thread.mjs";
import { LVal } from './base/LVal.mjs'
import { MailboxInterface } from "./MailboxInterface.mjs";
import { RawProcessID } from "./base/RawProcessID.mjs";

export interface RuntimeInterface {
    cleanup(): Promise<void>
    mkLabel(levid: any): any;
    rt_mkuuid();
    spawnAtNode(arg0: any, arg1: any);
    sendByValue(toPid: LVal<RawProcessID>, message: LVal): void;
    sendByHash(toPid: LVal<RawProcessID>, message: LVal): void;
    $t: Thread;   
    $service: any; // todo 2021-06-13; identify what the right interface here should be     
    debug(arg0: string);
    __userRuntime: any
    __sched: SchedulerInterface
    __mbox : MailboxInterface
    ret(arg0: any);
    // ret_raw ()
    // tailcall(funclos: any, __unit: any);
    persist (obj, path)    
    xconsole: Console
}