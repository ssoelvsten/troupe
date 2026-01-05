import { Thread } from "./Thread.mjs";
// import colors = require('colors/safe');
import chalk from 'chalk'
import { SchedulerInterface } from "./SchedulerInterface.mjs";
import { configureColors } from './colorConfig.mjs';
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
import { lookupPosition, type EncodedSourceMap } from './SourceMapResolver.mjs';

// Ensure colors are configured when this module is loaded
configureColors();

/**
 * Represents a single stack frame captured via V8's structured stack trace API.
 */
interface CallSite {
    getFileName(): string | null;
    getLineNumber(): number | null;
    getColumnNumber(): number | null;
    getFunctionName(): string | null;
    isEval(): boolean;
}

/**
 * Capture structured call sites from the current stack.
 * Uses V8's Error.prepareStackTrace API to get CallSite objects
 * with direct access to file/line/column info.
 */
function captureCallSites(): CallSite[] {
    const originalPrepare = Error.prepareStackTrace;
    const err = { stack: [] as CallSite[] };
    Error.prepareStackTrace = (_err, callSites) => callSites;
    Error.captureStackTrace(err);
    const sites = err.stack;
    Error.prepareStackTrace = originalPrepare;
    return sites;
}

/**
 * Classification of runtime error kinds.
 * Used to distinguish error origins for better error reporting.
 */
export enum ErrorKind {
    /** Type mismatch in built-in function arguments (e.g., passing string to numeric operation) */
    BuiltInArgsTypeMismatch,
    /** Information flow control violation (e.g., declassification without authority) */
    IFCCheck,
    /** Dynamic type error in user code (e.g., pattern match failure) */
    DynTypeError
}

/**
 * Known Troupe runtime file suffixes.
 * Stack frames ending with these are from the runtime, not user code.
 */
const RUNTIME_FILE_SUFFIXES = [
    '/rt/built/TroupeError.mjs',
    '/rt/built/Thread.mjs',
    '/rt/built/Asserts.mjs',
    '/rt/built/Scheduler.mjs',
    '/rt/built/runtimeMonitored.mjs',
    '/rt/built/builtins/runtimeassert.mjs',
];

/**
 * Check if a file path is from the Troupe runtime.
 */
function isRuntimeFile(fileName: string): boolean {
    return RUNTIME_FILE_SUFFIXES.some(suffix => fileName.endsWith(suffix));
}

/**
 * Translate source position using structured call sites.
 * Finds the first stack frame that is NOT from the runtime,
 * then uses the source map to translate that position to Troupe source.
 */
function translateWithCallSites(callSites: CallSite[], sourceMap: EncodedSourceMap | null): string | null {
    if (!sourceMap) return null;

    for (const site of callSites) {
        const fileName = site.getFileName();
        if (!fileName) continue;

        // Skip runtime frames - we want user code
        if (isRuntimeFile(fileName)) continue;

        // Check if this frame is already translated to .trp (Node.js --enable-source-maps)
        if (fileName.endsWith('.trp')) {
            const line = site.getLineNumber();
            const col = site.getColumnNumber();
            if (line !== null && col !== null) {
                return cleanSourcePath(`${fileName}:${line}:${col}`);
            }
        }

        // This is a frame from user code (generated JS) - translate it
        const line = site.getLineNumber();
        const col = site.getColumnNumber();
        if (line !== null && col !== null) {
            const pos = lookupPosition(sourceMap, line, col);
            if (pos) {
                // Source maps use 0-based columns; convert to 1-based for display
                return cleanSourcePath(`${pos.source}:${pos.line}:${pos.column + 1}`);
            }
        }

        // If we found a non-runtime frame but couldn't translate it, stop looking
        break;
    }
    return null;
}

/**
 * Clean up a source path to show a relative path.
 * If the path is already relative (doesn't start with /), use it as-is.
 * If absolute, try to extract a relative portion.
 */
function cleanSourcePath(fullPath: string): string {
    // Split into path and position (line:col)
    const match = fullPath.match(/^(.+\.trp):(\d+:\d+)$/);
    if (!match) return fullPath;

    const [, filePath, position] = match;

    // If already a relative path, use as-is
    if (!filePath.startsWith('/')) {
        return fullPath;
    }

    // For absolute paths, try to find the TROUPE project root and make relative
    // Look for common project markers in the path
    const troupeRootMatch = filePath.match(/.*\/Troupe\/(.+)$/);
    if (troupeRootMatch) {
        return `${troupeRootMatch[1]}:${position}`;
    }

    // Fallback: just use the filename
    const filenameMatch = filePath.match(/\/([^/]+\.trp)$/);
    if (filenameMatch) {
        return `${filenameMatch[1]}:${position}`;
    }

    return fullPath;
}

export abstract class TroupeError extends Error {
    abstract handleError (sched: SchedulerInterface) : void 
}

export abstract class ThreadError extends TroupeError {
    abstract errorMessage: string
    thread: Thread
    callSites: CallSite[]
    constructor (thread:Thread) {
        super ()
        this.thread = thread;
        // Capture structured call sites for source map translation
        this.callSites = captureCallSites();
    }
}

export abstract class StopThreadError extends ThreadError {
    abstract explainstr: string;
    abstract errorKind: ErrorKind;
    handleError (sched) {
        let console = this.thread.rtObj.xconsole
        console.log (chalk.red ( "Runtime error in thread " + this.thread.tidErrorStringRep()))
        console.log (chalk.red ( ">> " + this.errorMessage));

        // Determine source location based on error kind:
        // - BuiltInArgsTypeMismatch/IFCCheck: error in runtime code, use lastCallSourcePos
        // - DynTypeError: error in user code, use stack trace translation
        let sourceLocation: string | null = null;
        if (this.errorKind === ErrorKind.BuiltInArgsTypeMismatch || this.errorKind === ErrorKind.IFCCheck) {
            // Error occurred in runtime code (built-in or IFC check); use the saved call position
            sourceLocation = this.thread.lastCallSourcePos;
        } else {
            // Error occurred in user code; translate using structured call sites
            sourceLocation = translateWithCallSites(this.callSites, this.thread.currentSourceMap);
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
    errorKind: ErrorKind;
    get errorMessage () { return this.errstr }
    constructor (thread:Thread, errstr:string, explainstr: string, errorKind: ErrorKind = ErrorKind.DynTypeError) {
        super (thread) ;
        this.errstr = errstr;
        this.explainstr = explainstr;
        this.errorKind = errorKind;
    }
}

export class HandlerError extends ThreadError {
    errstr: string
    errorKind: ErrorKind
    constructor (thread: Thread, errstr: string, errorKind: ErrorKind = ErrorKind.DynTypeError) {
        super (thread);
        this.errstr = errstr;
        this.errorKind = errorKind;
    }
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