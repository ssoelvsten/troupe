import { Thread } from "./Thread.mjs";
// import colors = require('colors/safe');
import chalk from 'chalk'
import { SchedulerInterface } from "./SchedulerInterface.mjs";
import { configureColors } from './colorConfig.mjs';
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';

// Ensure colors are configured when this module is loaded
configureColors();

export abstract class TroupeError extends Error {
    abstract handleError (sched: SchedulerInterface) : void 
}

export abstract class ThreadError extends TroupeError {
    abstract errorMessage: string
    thread: Thread
    constructor (thread:Thread) {
        super ()
        this.thread = thread;
    }
}

export abstract class StopThreadError extends ThreadError {
    abstract explainstr: string;
    handleError (sched) {
        let console = this.thread.rtObj.xconsole
        console.log (chalk.red ( "Runtime error in thread " + this.thread.tidErrorStringRep()))
        console.log (chalk.red ( ">> " + this.errorMessage));
        if (getCliArgs()[TroupeCliArg.Explain] && this.explainstr) {
            console.log (chalk.yellow ( this.explainstr));
        }
        sched.stopThreadWithErrorMessage(this.thread, this.errorMessage);
    }
}

export class StrThreadError extends StopThreadError {
    errstr: string;
    explainstr : string; 
    get errorMessage () { return this.errstr }
    constructor (thread:Thread, errstr:string, explainstr: string ) {
        super (thread) ;
        this.errstr = errstr;        
        this.explainstr = explainstr
    } 
}

export class HandlerError extends ThreadError {
    constructor (thread: Thread, errstr: string) {
        super (thread);
        this.errstr = errstr; 
    }
    errstr: string 
    get errorMessage () { return this.errstr }
    handleError( sched:SchedulerInterface  ) {
          // we have an error inside of an receive pattern or guard;
          // we are discarding the rest of the current thread and are
          // scheduling the execution of the handler 
          let console = this.thread.rtObj.xconsole
          console.log (chalk.yellow (`Warning: runtime exception in the handler or sandbox: ${this.errstr}`))
          this.thread.next = this.thread.handlerState.getTrapper();
          sched.scheduleThread(this.thread)
    }
}

export class ImplementationError extends Error { // observe that this does not inherit from TroupeError
    errstr :string
    constructor (s: string) {
        super ()
        this.errstr = s 
    }
}