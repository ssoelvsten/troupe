import { Thread } from "./Thread.mjs";
import { LVal } from './LVal.mjs'
import { Level } from "./Level.mjs";

export interface SchedulerInterface {
    resetScheduler(): void;

    scheduleNewThread(fun: () => any, arg: any, pc: Level, block: Level): LVal;
    scheduleThread(t: Thread): void;

    blockThread(t: Thread): void;
    unblockThread(tid: LVal): void;

    isAlive(tid: LVal): boolean;
    getThread(tid: LVal): Thread;
    getCurrentThread(): Thread;
    setCurrentThread(t: Thread): Thread;

    stopThreadWithErrorMessage (t: Thread, errMsg: string): void

    resumeLoopAsync(): void;
}
