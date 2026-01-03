import { Thread } from "./Thread.mjs";
// import colors = require('colors/safe');
import chalk from 'chalk'
import { SchedulerInterface } from "./SchedulerInterface.mjs";
import { configureColors } from './colorConfig.mjs';
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';

// Ensure colors are configured when this module is loaded
configureColors();

/**
 * Extract the first Troupe source location from a stack trace string.
 * With --enable-source-maps, Node.js translates JS positions to .trp positions.
 * Returns a cleaned path like "tests/foo.trp:10:5" or null if not found.
 */
function extractTroupeSourceLocation(stack: string | undefined): string | null {
    if (!stack) return null;
    for (const line of stack.split('\n')) {
        // Match patterns like:
        //   "at Top.f23 (/path/to/file.trp:1:15)"
        //   "at /path/to/file.trp:1:15"
        const match = line.match(/\(([^)]*\.trp:\d+:\d+)\)/) ||
                      line.match(/at\s+(\S*\.trp:\d+:\d+)/);
        if (match) {
            return cleanSourcePath(match[1]);
        }
    }
    return null;
}

/**
 * Clean up a source path to show a relative path.
 * Node.js resolves source map paths relative to the JS file location (often /tmp),
 * resulting in paths like "/tmp/tests/foo.trp:1:15". We extract just the
 * meaningful relative path.
 */
function cleanSourcePath(fullPath: string): string {
    // Split into path and position (line:col)
    const match = fullPath.match(/^(.+\.trp):(\d+:\d+)$/);
    if (!match) return fullPath;

    const [, filePath, position] = match;

    // Look for known path prefixes that indicate project-relative paths
    // e.g., "/tmp/tests/foo.trp" -> "tests/foo.trp"
    //       "/tmp/lib/Foo.trp" -> "lib/Foo.trp"
    const patterns = [
        /.*\/(tests\/.+)$/,      // tests/...
        /.*\/(lib\/.+)$/,        // lib/...
        /.*\/([^/]+\.trp)$/      // fallback: just filename
    ];

    for (const pattern of patterns) {
        const pathMatch = filePath.match(pattern);
        if (pathMatch) {
            return `${pathMatch[1]}:${position}`;
        }
    }

    return fullPath;
}

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
        // Try to get source location from JS stack trace (works when error occurs in user code)
        let sourceLocation = extractTroupeSourceLocation(this.stack);
        // Fall back to lastCallSourcePos (works when error occurs in runtime built-ins)
        if (!sourceLocation && this.thread.lastCallSourcePos) {
            sourceLocation = this.thread.lastCallSourcePos;
        }
        if (sourceLocation) {
            console.log (chalk.red ( ">> at " + sourceLocation));
        }
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