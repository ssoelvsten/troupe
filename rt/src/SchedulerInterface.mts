import { Thread } from "./Thread.mjs";
import { LVal } from './Lval.mjs'
import { Level } from "./Level.mjs";

export interface SchedulerInterface {
    __currentThread: Thread;

    resetScheduler(): void;

    scheduleNewThreadAtLevel(fun: () => any, arg: any, pc: Level, block: Level): LVal;
    scheduleThread(t: Thread): void;

    blockThread(t: Thread): void;
    unblockThread(tid: LVal): void;

    isAlive(tid: LVal): boolean;
    getThread(tid: LVal): Thread;

    stopThreadWithErrorMessage (t: Thread, errMsg: string): void

    resumeLoopAsync(): void;
}
