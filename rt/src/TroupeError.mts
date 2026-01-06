import { Thread } from "./Thread.mjs";
// import colors = require('colors/safe');
import chalk from 'chalk'
import { SchedulerInterface } from "./SchedulerInterface.mjs";
import { configureColors } from './colorConfig.mjs';
import { getCliArgs, TroupeCliArg } from './TroupeCliArgs.mjs';
import { lookupPosition, type EncodedSourceMap } from './SourceMapResolver.mjs';
import { readFileSync, existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

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
    '/rt/built/builtins/UserRuntimeZero.mjs',
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
    // Check for valid source map (must have 'sources' property to be usable for translation)
    // Note: sourceMap may be { __isRestored: true } for restored code, which isn't a valid source map
    const hasValidSourceMap = sourceMap && 'sources' in sourceMap;
    if (!hasValidSourceMap) return null;

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

// ============================================================================
// Source Code Display Functions
// These functions provide visual error context similar to compiler errors
// ============================================================================

/** Tab stop width for display (matches common editor defaults) */
const TAB_WIDTH = 8;

/**
 * Expand tabs to spaces for consistent display.
 * Uses 8-space tab stops (matching ParseError.hs behavior).
 */
function expandTabs(line: string): string {
    let result = '';
    let col = 0;
    for (const ch of line) {
        if (ch === '\t') {
            const spaces = TAB_WIDTH - (col % TAB_WIDTH);
            result += ' '.repeat(spaces);
            col += spaces;
        } else {
            result += ch;
            col++;
        }
    }
    return result;
}

/**
 * Adjust column number for tabs in the source line.
 * Converts a 1-indexed column in the original (with tabs) to
 * the equivalent position after tab expansion.
 */
function adjustForTabs(line: string, col: number): number {
    let displayCol = 0;
    for (let i = 0; i < col - 1 && i < line.length; i++) {
        if (line[i] === '\t') {
            displayCol += TAB_WIDTH - (displayCol % TAB_WIDTH);
        } else {
            displayCol++;
        }
    }
    return displayCol + 1; // Return 1-indexed
}

/**
 * Create a caret line pointing to error column (1-indexed).
 */
function makeCaretLine(col: number): string {
    return ' '.repeat(col - 1) + '^';
}

/**
 * Parse a source location string into components.
 * Expected format: "filepath:line:col"
 */
function parseSourceLocation(loc: string): { filePath: string; line: number; col: number } | null {
    // Match path (may contain colons on Windows), then :line:col
    const match = loc.match(/^(.+):(\d+):(\d+)$/);
    if (!match) return null;
    return {
        filePath: match[1],
        line: parseInt(match[2], 10),
        col: parseInt(match[3], 10)
    };
}

/**
 * Resolve a potentially relative file path to an absolute path.
 * Tries multiple strategies: cwd, TROUPE env variable.
 */
function resolveSourcePath(filePath: string): string | null {
    // If already absolute and exists, use it
    if (isAbsolute(filePath)) {
        if (existsSync(filePath)) return filePath;
        return null;
    }

    // Try relative to current working directory
    const cwdPath = resolve(process.cwd(), filePath);
    if (existsSync(cwdPath)) return cwdPath;

    // Try relative to TROUPE environment variable
    const troupeRoot = process.env['TROUPE'];
    if (troupeRoot) {
        const troupePath = resolve(troupeRoot, filePath);
        if (existsSync(troupePath)) return troupePath;
    }

    return null;
}

/**
 * Attempt to read a source line from a file.
 * Returns null if file is unavailable or line is out of range.
 */
function getSourceLine(filePath: string, lineNum: number): string | null {
    const resolvedPath = resolveSourcePath(filePath);
    if (!resolvedPath) return null;

    try {
        const content = readFileSync(resolvedPath, 'utf-8');
        const lines = content.split('\n');
        if (lineNum > 0 && lineNum <= lines.length) {
            return lines[lineNum - 1];
        }
    } catch {
        // File read error - silently return null
    }
    return null;
}

/**
 * Result of attempting to format source context.
 */
interface SourceContextResult {
    /** Whether source was successfully read */
    available: boolean;
    /** Lines to display (source line and caret, or unavailable message) */
    lines: string[];
}

/**
 * Format source context for an error location.
 * Returns the source line with line number prefix and caret line,
 * or an unavailable message if source cannot be read.
 */
function formatSourceContext(sourceLocation: string): SourceContextResult {
    const parsed = parseSourceLocation(sourceLocation);
    if (!parsed) {
        return { available: false, lines: ['  (source file not available)'] };
    }

    const { filePath, line, col } = parsed;
    const sourceLine = getSourceLine(filePath, line);

    if (sourceLine === null) {
        return { available: false, lines: ['  (source file not available)'] };
    }

    // Format like compiler: "  N | source code"
    const lineNumStr = String(line);
    const lineNumWidth = lineNumStr.length;
    const expandedLine = expandTabs(sourceLine);
    const adjustedCol = adjustForTabs(sourceLine, col);

    const sourceDisplay = `  ${lineNumStr} | ${expandedLine}`;
    const caretDisplay = `  ${' '.repeat(lineNumWidth)} | ${makeCaretLine(adjustedCol)}`;

    return {
        available: true,
        lines: ['', sourceDisplay, caretDisplay, '']
    };
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
            // Fall back to lastCallSourcePos if stack trace translation fails.
            // This handles cases like prelude/library code where assertions fail
            // but the stack trace doesn't contain user code with source positions.
            if (!sourceLocation && this.thread.lastCallSourcePos) {
                sourceLocation = this.thread.lastCallSourcePos;
            }
        }

        // Format error with source context (visually consistent with compiler errors)
        console.log(chalk.red("Runtime error in thread " + this.thread.tidErrorStringRep()));

        // Indicate if error occurred in restored code (deserialized closure)
        if (this.thread.currentSourceMap?.__isRestored) {
            console.log(chalk.yellow(">> (in restored code)"));
        }

        // Show source context if location is available
        if (sourceLocation) {
            const sourceContext = formatSourceContext(sourceLocation);
            for (const line of sourceContext.lines) {
                console.log(chalk.red(line));
            }
        }

        console.log(chalk.red(">> " + this.errorMessage));

        if (sourceLocation) {
            console.log(chalk.red(">> at " + sourceLocation));
        }

        if (getCliArgs()[TroupeCliArg.Explain] && this.explainstr) {
            console.log(chalk.yellow(this.explainstr));
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